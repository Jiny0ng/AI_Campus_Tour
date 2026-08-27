#!/usr/bin/env python3
"""Generate isolated ending-prompt samples without replacing active assets."""

from __future__ import annotations

import argparse
import array
import copy
import io
import json
import math
import os
import re
import sys
import time
import wave
from dataclasses import replace
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from services import tts_service  # noqa: E402
from services.audio_storage import load_manifest, write_object  # noqa: E402
from services.tts_prompt_catalog import build_docent_prompt  # noqa: E402
from services.tts_presets import BUBBLY_DOCENT  # noqa: E402
from services.tts_service import audio_id_for, object_name_for  # noqa: E402


HANGUL_AND_DIGITS = re.compile(r"[^0-9가-힣]+")
FINAL_WORDS = re.compile(r"[0-9A-Za-z가-힣]+")
TAIL_SECONDS = 4
MAX_SYNTHESIS_ATTEMPTS = 3

ENDING_DIRECTION = """
추가 이야기형 낭독 지시:
사실을 하나씩 끊어 읽는 안내방송처럼 말하지 않는다. 앞 문장의 의미가 다음 문장으로
자연스럽게 이어지도록 이야기하듯 낭독한다. '~입니다', '~했습니다'를 연속해서 반복하지
않고, 연결형 문장에서는 다음 내용에 대한 기대가 느껴지게 한다. 관찰 질문과 호응 유도는
과장하지 않고 따뜻하고 친근하게 표현한다.

추가 발음과 호흡 지시:
'전북대학교'의 각 음절과 '표범'의 받침을 정확하고 또렷하게 발음한다. '전묵대학교',
'표봉'처럼 들리게 발음하지 않는다. 한 호흡에 너무 긴 문장을 밀어 읽지 말고 문장 안의
의미 단위는 짧게 나눈다. 문장 사이의 쉼은 짧게 유지하고, 다음 문장을 시작하기 전의
들이마시는 숨소리는 거의 들리지 않게 작고 빠르게 처리한다. 길고 큰 들숨이나 긴 정적을
만들지 않는다.

추가 마무리 연기 지시:
문장의 마지막 모음은 과도하게 늘이지 않는다. 다만 마지막 음절을 짧게 잘라 먹거나
급하게 끝내지 말고, 자연스러운 호흡과 완만한 하강 억양으로 차분하게 마무리한다.
안내 전체의 마지막 문장에서도 말하는 속도를 갑자기 높이지 말고 평소 속도를 유지한다.
마지막 문장은 마침표까지 완전한 문장으로 읽는다. 마지막 단어와 마지막 음절을 생략하거나
흐리지 말고 또렷하게 끝낸다. 음성 파일의 뒤쪽 여유는 후처리로 추가하므로, 낭독하면서
임의로 길게 여운을 만들 필요는 없다.
""".strip()


def sample_texts() -> dict[str, str]:
    return {
        "tour_01_new_gate": (
            "지금 보고 계신 곳은 전북대학교의 신정문입니다. 전북대학교의 정문이자 "
            "한국적인 캠퍼스를 상징하는 공간인데요. 2019년에 전통 한옥 형태로 "
            "완공되었습니다. 중앙의 현판은 당시 중문과 김병기 교수가 직접 쓴 글씨라고 "
            "해요. 알고 보니 조금 다르게 느껴지지 않나요? 신정문의 첫인상을 기억해 보세요."
        ),
        "tour_03_university_headquarters": (
            "지금 보고 계신 곳은 전북대학교의 행정 중심인 대학본부입니다. 총장실과 "
            "주요 행정부서가 모여 있는 곳인데요. 건물 앞에는 학교를 상징하는 표범상도 "
            "있습니다. 표범은 1981년 약 6천 명이 참여한 투표로 선정되었고, 이듬해 "
            "지금의 조형물이 세워졌어요. 힘찬 자세에서 전북대의 기상이 느껴지지 않나요?"
        ),
        "docent_leopard_statue": (
            "지금 보고 계신 조형물은 전북대학교를 상징하는 표범상입니다. 학교는 표범이 "
            "지닌 지혜와 용감함을 중요한 기상으로 여기는데요. 이 상징은 1981년 약 "
            "6천 명이 참여한 투표로 선정되었습니다. 이듬해에는 지금의 조형물이 대학본부 "
            "앞에 세워졌어요. 그 힘찬 자세가 느껴지시나요? 전북대학교의 상징을 기억해 보세요."
        ),
    }


def fallback_text(text: str, attempt: int) -> str:
    """Use a safer complete ending only on the final synthesis attempt."""
    if attempt < MAX_SYNTHESIS_ATTEMPTS:
        return text
    replacements = {
        "신정문의 첫인상을 기억해 보세요.": "이 모습이 바로 신정문이 전하는 첫인상입니다.",
        "힘찬 자세에서 전북대의 기상이 느껴지지 않나요?": "이 모습에는 전북대의 힘찬 기상이 담겨 있습니다.",
        "전북대학교의 상징을 기억해 보세요.": "이 조형물은 전북대학교를 대표하는 상징입니다.",
    }
    for original, replacement in replacements.items():
        if text.endswith(original):
            return text.removesuffix(original) + replacement
    return text


def expected_ending(text: str, word_count: int = 2) -> str:
    words = FINAL_WORDS.findall(text)
    return "".join(words[-word_count:])


def normalized_hangul(text: str) -> str:
    return HANGUL_AND_DIGITS.sub("", text)


def ending_matches(text: str, transcript: str) -> bool:
    expected = normalized_hangul(expected_ending(text))
    recognized = normalized_hangul(transcript)
    return bool(expected) and recognized.endswith(expected)


def wav_details(audio: bytes) -> tuple[wave._wave_params, bytes]:
    with wave.open(io.BytesIO(audio), "rb") as source:
        return source.getparams(), source.readframes(source.getnframes())


def waveform_confidently_complete(audio: bytes) -> tuple[bool, dict[str, float]]:
    """Fast-pass WAVs with a natural quiet tail; ambiguous endings go to STT."""
    params, frames = wav_details(audio)
    if params.sampwidth != 2 or params.nchannels != 1:
        return False, {"quietTailMs": 0.0, "tailRms": math.inf}
    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    threshold = 240
    quiet_samples = 0
    for sample in reversed(samples):
        if abs(sample) > threshold:
            break
        quiet_samples += 1
    tail_window = samples[-max(1, round(params.framerate * 0.08)):]
    tail_rms = math.sqrt(sum(sample * sample for sample in tail_window) / len(tail_window))
    quiet_tail_ms = quiet_samples / params.framerate * 1_000
    # Require a meaningful natural tail and low terminal energy. Anything less
    # certain is verified semantically instead of being guessed from waveform.
    passed = quiet_tail_ms >= 140 and tail_rms <= threshold
    return passed, {"quietTailMs": round(quiet_tail_ms, 1), "tailRms": round(tail_rms, 1)}


def tail_wav(audio: bytes, seconds: int = TAIL_SECONDS) -> bytes:
    params, frames = wav_details(audio)
    frame_width = params.sampwidth * params.nchannels
    wanted = min(params.nframes, params.framerate * seconds)
    selected = frames[-wanted * frame_width:]
    output = io.BytesIO()
    with wave.open(output, "wb") as destination:
        destination.setparams(params)
        destination.writeframes(selected)
    return output.getvalue()


def split_text_chunks(text: str, max_chars: int = 60) -> list[str]:
    """Group complete sentences into TTS requests below the observed cutoff."""
    sentences = [value.strip() for value in re.findall(r"[^.!?]+[.!?]?", text) if value.strip()]
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        combined = f"{current} {sentence}".strip()
        if current and len(combined) > max_chars:
            chunks.append(current)
            current = sentence
        else:
            current = combined
    if current:
        chunks.append(current)
    return chunks


def concatenate_wavs(parts: list[bytes], pause_milliseconds: int = 120) -> bytes:
    if not parts:
        raise ValueError("at least one WAV part is required")
    first_params, first_frames = wav_details(parts[0])
    frames = [first_frames]
    pause_frames = round(first_params.framerate * pause_milliseconds / 1_000)
    pause = b"\x00" * pause_frames * first_params.nchannels * first_params.sampwidth
    for part in parts[1:]:
        params, part_frames = wav_details(part)
        if (
            params.nchannels,
            params.sampwidth,
            params.framerate,
            params.comptype,
        ) != (
            first_params.nchannels,
            first_params.sampwidth,
            first_params.framerate,
            first_params.comptype,
        ):
            raise ValueError("WAV parts use incompatible PCM formats")
        frames.extend((pause, part_frames))
    output = io.BytesIO()
    with wave.open(output, "wb") as destination:
        destination.setparams(first_params)
        destination.writeframes(b"".join(frames))
    return output.getvalue()


def synthesize_candidate(text: str, chunked: bool) -> tuple[bytes, int]:
    chunks = split_text_chunks(text) if chunked else [text]
    parts = []
    for chunk_index, chunk in enumerate(chunks, start=1):
        last_error: Exception | None = None
        for request_attempt in range(1, 4):
            try:
                parts.append(
                    tts_service._synthesize_with_google(
                        chunk, "ko-KR", "core-docent", timeout_seconds=90
                    )
                )
                break
            except Exception as error:
                last_error = error
                print(json.dumps({
                    "ttsRetry": request_attempt,
                    "chunk": f"{chunk_index}/{len(chunks)}",
                    "error": type(error).__name__,
                }), flush=True)
                if request_attempt < 3:
                    time.sleep(request_attempt * 2)
        else:
            raise RuntimeError(
                f"TTS chunk {chunk_index}/{len(chunks)} failed after 3 requests"
            ) from last_error
    return concatenate_wavs(parts), len(chunks)


def transcribe_tail(audio: bytes) -> str:
    from google.cloud import speech_v1 as speech

    params, _ = wav_details(audio)
    response = speech.SpeechClient().recognize(
        config=speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=params.framerate,
            audio_channel_count=params.nchannels,
            language_code="ko-KR",
            enable_automatic_punctuation=False,
            model=os.getenv("STT_MODEL", "latest_short"),
        ),
        audio=speech.RecognitionAudio(content=tail_wav(audio)),
        timeout=15,
    )
    return " ".join(
        result.alternatives[0].transcript
        for result in response.results
        if result.alternatives
    ).strip()


def synthesize_verified(text: str) -> tuple[bytes, str, dict[str, object]]:
    failures: list[dict[str, object]] = []
    for attempt in range(1, MAX_SYNTHESIS_ATTEMPTS + 1):
        candidate_text = fallback_text(text, attempt)
        # The Pro endpoint repeatedly truncated these Korean scripts when a
        # single request exceeded roughly 140 characters. Start long scripts
        # in sentence chunks instead of spending two doomed full-text calls.
        chunked = len(candidate_text) > 140 or attempt == MAX_SYNTHESIS_ATTEMPTS
        raw_audio, chunk_count = synthesize_candidate(candidate_text, chunked)
        wave_passed, metrics = waveform_confidently_complete(raw_audio)
        transcript = ""
        stt_checked = not wave_passed
        passed = wave_passed
        if stt_checked:
            transcript = transcribe_tail(raw_audio)
            passed = ending_matches(candidate_text, transcript)
        result = {
            "attempt": attempt,
            "chunked": chunked,
            "chunkCount": chunk_count,
            "waveformPassed": wave_passed,
            "sttChecked": stt_checked,
            "expectedEnding": expected_ending(candidate_text),
            "transcript": transcript,
            **metrics,
        }
        print(json.dumps({"qualityGate": result, "passed": passed}, ensure_ascii=False), flush=True)
        if passed:
            return append_trailing_silence(raw_audio), candidate_text, result
        failures.append(result)
    raise RuntimeError(f"ending quality gate failed after {MAX_SYNTHESIS_ATTEMPTS} attempts: {failures}")


def append_trailing_silence(audio: bytes, milliseconds: int = 700) -> bytes:
    """Keep the final phoneme away from the physical end of a PCM WAV file."""
    with wave.open(io.BytesIO(audio), "rb") as source:
        params = source.getparams()
        frames = source.readframes(source.getnframes())
    silence_frames = round(params.framerate * milliseconds / 1_000)
    silence = b"\x00" * silence_frames * params.nchannels * params.sampwidth
    output = io.BytesIO()
    with wave.open(output, "wb") as destination:
        destination.setparams(params)
        destination.writeframes(frames + silence)
    return output.getvalue()


def atomic_save(path: Path, payload: dict) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args()
    if not args.upload:
        print("Use --upload on an authenticated operator host", file=sys.stderr)
        return 1

    preset = replace(
        BUBBLY_DOCENT,
        id="bubbly-proud-senior-story-sample-v12",
        # Do not inherit BUBBLY_DOCENT.prompt here: it includes the legacy
        # SHORT_ENDINGS instruction to end the final syllable immediately,
        # which conflicts with the reviewed natural-ending direction below.
        prompt=f"{build_docent_prompt('bubbly_proud_senior')}\n\n{ENDING_DIRECTION}",
    )
    tts_service.preset_for = lambda style, locale: preset
    manifest_path = Path(os.environ["TTS_MANIFEST_PATH"])
    next_manifest = copy.deepcopy(load_manifest())

    generated = []
    for position, (entity_id, text) in enumerate(sample_texts().items(), start=1):
        asset_id = f"sample-story:{entity_id}:ko"
        version = "story-prompt-sample-v12"
        print(json.dumps({"generating": asset_id, "progress": f"{position}/3"}, ensure_ascii=False), flush=True)
        audio, verified_text, quality = synthesize_verified(text)
        content_hash = audio_id_for(verified_text, "ko-KR", "core-docent", version)
        object_name = object_name_for(content_hash, "ko-KR", "core-docent")
        generated.append((asset_id, entity_id, version, content_hash, object_name, audio, quality))

    # Do not publish any sample until all three have passed the quality gate.
    for asset_id, entity_id, version, content_hash, object_name, audio, quality in generated:
        write_object(object_name, audio, {
            "content_hash": content_hash,
            "entity_id": entity_id,
            "locale": "ko-KR",
            "style": "core-docent",
            "content_version": version,
            "media_type": preset.media_type,
            "preset": preset.id,
            "model": preset.model,
            "voice": preset.voice,
            "encoding": preset.encoding,
            "ending_quality": json.dumps(quality, ensure_ascii=False),
        })
        next_manifest["assets"][asset_id] = {
            "audioId": content_hash,
            "objectName": object_name,
            "locale": "ko-KR",
            "style": "core-docent",
            "contentVersion": version,
            "mediaType": preset.media_type,
            "preset": preset.id,
        }
        print(json.dumps({"uploaded": asset_id, "bytes": len(audio), "quality": quality}, ensure_ascii=False), flush=True)

    atomic_save(manifest_path, next_manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
