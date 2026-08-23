from __future__ import annotations

import hashlib
import html
import os
import re
import time
from dataclasses import dataclass
from functools import lru_cache

from services.audio_storage import AudioStorageUnavailable, read_object, write_object


CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
HTML_TAGS = re.compile(r"<[^>]*>")
WHITESPACE = re.compile(r"\s+")

STYLE_PROMPTS = {
    "navigation": "Speak clearly, briefly, and calmly like a navigation assistant.",
    "arrival": "Speak clearly with a warm but restrained arrival tone.",
    "system": "Speak clearly and neutrally as a short system notification.",
    "filler": "Speak naturally and briefly in a friendly campus guide tone.",
    "core-docent": "Narrate warmly and clearly like a knowledgeable campus docent.",
    "location-docent": "Narrate warmly, concisely, and clearly like a campus docent.",
    "user-answer": "Answer naturally and clearly in a friendly campus guide tone.",
}


class TtsUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class SynthesisResult:
    content: bytes
    audio_id: str
    cache_status: str
    synthesis_ms: int
    storage_read_ms: int


def normalize_text(text: str) -> str:
    without_tags = HTML_TAGS.sub(" ", html.unescape(text))
    without_controls = CONTROL_CHARACTERS.sub("", without_tags)
    return WHITESPACE.sub(" ", without_controls).strip()


def audio_id_for(text: str, locale: str, style: str, content_version: str) -> str:
    parts = (
        normalize_text(text),
        locale,
        os.getenv("TTS_VOICE_NAME", "Kore"),
        style,
        os.getenv("TTS_MODEL", "gemini-2.5-flash-tts"),
        os.getenv("TTS_PROMPT_VERSION", "v1"),
        content_version,
    )
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def object_name_for(audio_id: str, locale: str, style: str) -> str:
    scope = "cache/location-docent" if style == "location-docent" else f"assets/{style}"
    voice = os.getenv("TTS_VOICE_NAME", "Kore")
    return f"{scope}/{locale}/{voice}/{audio_id}.mp3"


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


def _synthesize_with_google(text: str, locale: str, style: str) -> bytes:
    try:
        from google.cloud import texttospeech
    except ImportError as error:
        raise TtsUnavailable("google-cloud-texttospeech is not installed") from error

    prompt = STYLE_PROMPTS[style]
    try:
        response = _tts_client().synthesize_speech(
            input=texttospeech.SynthesisInput(text=text, prompt=prompt),
            voice=texttospeech.VoiceSelectionParams(
                language_code=locale,
                name=os.getenv("TTS_VOICE_NAME", "Kore"),
                model_name=os.getenv("TTS_MODEL", "gemini-2.5-flash-tts"),
            ),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
            ),
            timeout=12.0,
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
    storage_started = time.monotonic()
    if should_cache:
        try:
            stored = read_object(object_name)
        except AudioStorageUnavailable:
            stored = None
        storage_read_ms = round((time.monotonic() - storage_started) * 1000)
        if stored is not None:
            return SynthesisResult(stored.content, audio_id, "HIT", 0, storage_read_ms)
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
                    "voice": os.getenv("TTS_VOICE_NAME", "Kore"),
                    "style": style,
                    "model": os.getenv("TTS_MODEL", "gemini-2.5-flash-tts"),
                    "created_at": str(int(time.time())),
                    "content_version": content_version,
                },
            )
        except AudioStorageUnavailable:
            cache_status = "BYPASS"

    return SynthesisResult(content, audio_id, cache_status, synthesis_ms, storage_read_ms)

