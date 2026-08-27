"""Production Gemini-TTS presets selected through listening tests."""

from __future__ import annotations

from dataclasses import dataclass

from services.tts_prompt_catalog import build_docent_prompt


@dataclass(frozen=True)
class TtsPreset:
    id: str
    model: str
    voice: str
    prompt: str
    speaking_rate: float
    pitch: float
    volume_gain_db: float
    sample_rate_hertz: int | None
    encoding: str
    extension: str
    media_type: str


SHORT_ENDINGS = (
    "\n\n종결어미 연기 지시:\n"
    "종결어미의 마지막 모음을 늘이지 않는다. "
    "마지막 음절은 짧게 발음하고 즉시 문장을 끝낸다. "
    "문장 끝에 추가적인 억양이나 여운을 두지 않는다. "
    "다만 단어를 잘라 먹거나 기계적으로 뚝 끊지는 않는다."
)


BUBBLY_DOCENT = TtsPreset(
    id="bubbly-proud-senior-v1",
    model="gemini-2.5-pro-tts",
    voice="Sulafat",
    prompt=build_docent_prompt("bubbly_proud_senior") + SHORT_ENDINGS,
    speaking_rate=1.08,
    pitch=4.0,
    volume_gain_db=0.0,
    sample_rate_hertz=24000,
    encoding="LINEAR16",
    extension="wav",
    media_type="audio/wav",
)

FAST_CHAT_ANSWER = TtsPreset(
    id="bubbly-proud-senior-flash-v1",
    model="gemini-2.5-flash-tts",
    voice="Sulafat",
    prompt=build_docent_prompt("bubbly_proud_senior") + SHORT_ENDINGS,
    speaking_rate=1.08,
    pitch=4.0,
    volume_gain_db=0.0,
    sample_rate_hertz=24000,
    encoding="LINEAR16",
    extension="wav",
    media_type="audio/wav",
)


def preset_for(style: str, locale: str) -> TtsPreset:
    # Interactive answers favor latency. Reviewed navigation and docent assets
    # keep the listening-tested Pro preset and remain immutable stored WAVs.
    del locale
    if style == "user-answer":
        return FAST_CHAT_ANSWER
    return BUBBLY_DOCENT
