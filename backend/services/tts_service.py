from __future__ import annotations

import hashlib
import html
import os
import re
import time
from dataclasses import dataclass
from functools import lru_cache

from services.audio_storage import AudioStorageUnavailable, read_object, write_object
from services.tts_presets import preset_for


CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
HTML_TAGS = re.compile(r"<[^>]*>")
WHITESPACE = re.compile(r"\s+")

class TtsUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class SynthesisResult:
    content: bytes
    audio_id: str
    cache_status: str
    synthesis_ms: int
    storage_read_ms: int
    media_type: str


def normalize_text(text: str) -> str:
    without_tags = HTML_TAGS.sub(" ", html.unescape(text))
    without_controls = CONTROL_CHARACTERS.sub("", without_tags)
    return WHITESPACE.sub(" ", without_controls).strip()


def audio_id_for(text: str, locale: str, style: str, content_version: str) -> str:
    preset = preset_for(style, locale)
    parts = (
        normalize_text(text),
        locale,
        preset.voice,
        style,
        preset.model,
        preset.id,
        str(preset.speaking_rate),
        str(preset.pitch),
        str(preset.volume_gain_db),
        str(preset.sample_rate_hertz),
        preset.encoding,
        content_version,
    )
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def object_name_for(audio_id: str, locale: str, style: str) -> str:
    scope = "cache/location-docent" if style == "location-docent" else f"assets/{style}"
    preset = preset_for(style, locale)
    return f"{scope}/{locale}/{preset.voice}/{audio_id}.{preset.extension}"


@lru_cache(maxsize=1)
def _tts_client():
    try:
        from google.api_core.client_options import ClientOptions
        from google.cloud import texttospeech
    except ImportError as error:
        raise TtsUnavailable("google-cloud-texttospeech is not installed") from error

    location = os.getenv("GOOGLE_CLOUD_REGION", "global")
    endpoint = (
        f"{location}-texttospeech.googleapis.com"
        if location != "global"
        else "texttospeech.googleapis.com"
    )
    return texttospeech.TextToSpeechClient(
        client_options=ClientOptions(api_endpoint=endpoint)
    )


def _synthesize_with_google(
    text: str,
    locale: str,
    style: str,
    timeout_seconds: float = 12.0,
) -> bytes:
    try:
        from google.cloud import texttospeech
    except ImportError as error:
        raise TtsUnavailable("google-cloud-texttospeech is not installed") from error

    preset = preset_for(style, locale)
    try:
        response = _tts_client().synthesize_speech(
            input=texttospeech.SynthesisInput(text=text, prompt=preset.prompt),
            voice=texttospeech.VoiceSelectionParams(
                language_code=locale,
                name=preset.voice,
                model_name=preset.model,
            ),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=getattr(texttospeech.AudioEncoding, preset.encoding),
                speaking_rate=preset.speaking_rate,
                pitch=preset.pitch,
                volume_gain_db=preset.volume_gain_db,
                **(
                    {"sample_rate_hertz": preset.sample_rate_hertz}
                    if preset.sample_rate_hertz is not None
                    else {}
                ),
            ),
            timeout=timeout_seconds,
        )
    except Exception as error:
        raise TtsUnavailable("Google Cloud TTS synthesis failed") from error
    if not response.audio_content:
        raise TtsUnavailable("Google Cloud TTS returned empty audio")
    return response.audio_content


def synthesize(text: str, locale: str, style: str, content_version: str) -> SynthesisResult:
    clean_text = normalize_text(text)
    if not clean_text:
        raise ValueError("text is empty after normalization")
    if len(clean_text) > 500 or len(clean_text.encode("utf-8")) > 4_000:
        raise ValueError("normalized text exceeds the synthesis limit")
    if os.getenv("TTS_REALTIME_ENABLED", "true").lower() not in {"1", "true", "yes"}:
        raise TtsUnavailable("real-time TTS is disabled")

    audio_id = audio_id_for(clean_text, locale, style, content_version)
    should_cache = style != "user-answer"
    object_name = object_name_for(audio_id, locale, style)
    preset = preset_for(style, locale)
    storage_started = time.monotonic()
    if should_cache:
        try:
            stored = read_object(object_name)
        except AudioStorageUnavailable:
            stored = None
        storage_read_ms = round((time.monotonic() - storage_started) * 1000)
        if stored is not None:
            return SynthesisResult(stored.content, audio_id, "HIT", 0, storage_read_ms, preset.media_type)
    else:
        storage_read_ms = 0

    synthesis_started = time.monotonic()
    content = _synthesize_with_google(clean_text, locale, style)
    synthesis_ms = round((time.monotonic() - synthesis_started) * 1000)

    cache_status = "BYPASS" if not should_cache else "MISS"
    if should_cache:
        try:
            write_object(
                object_name,
                content,
                {
                    "content_hash": audio_id,
                    "locale": locale,
                    "voice": preset.voice,
                    "style": style,
                    "model": preset.model,
                    "preset": preset.id,
                    "media_type": preset.media_type,
                    "created_at": str(int(time.time())),
                    "content_version": content_version,
                },
            )
        except AudioStorageUnavailable:
            cache_status = "BYPASS"

    return SynthesisResult(content, audio_id, cache_status, synthesis_ms, storage_read_ms, preset.media_type)
