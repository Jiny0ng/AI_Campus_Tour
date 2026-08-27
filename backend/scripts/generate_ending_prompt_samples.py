#!/usr/bin/env python3
"""Generate isolated ending-prompt samples without replacing active assets."""

from __future__ import annotations

import argparse
import copy
import io
import json
import os
import sys
import wave
from dataclasses import replace
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from services import tts_service  # noqa: E402
from services.audio_storage import load_manifest, write_object  # noqa: E402
from services.tts_presets import BUBBLY_DOCENT  # noqa: E402
from services.tts_service import audio_id_for, object_name_for  # noqa: E402

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
            "한국적인 캠퍼스를 상징하는 공간인데요. 2019년에 완공되어 전통 한옥의 "
            "멋을 보여 줍니다. 중앙의 현판도 한번 살펴보세요. 당시 중문과 김병기 교수가 "
            "직접 쓴 글씨라고 해요. 그 이야기를 알고 보니 조금 다르게 느껴지지 않나요? "
            "안으로 들어가기 전에 신정문의 첫인상을 기억해 보세요."
        ),
        "tour_03_university_headquarters": (
            "지금 보고 계신 곳은 전북대학교의 행정 중심인 대학본부입니다. 총장실과 "
            "주요 행정부서가 모여 있는 곳인데요. 건물 앞에는 학교를 상징하는 표범상도 "
            "있습니다. 지혜롭고 용감하게 전진하는 모습에는 전북대인의 기상이 담겨 있어요. "
            "이 상징은 1981년, 약 6천 명이 참여한 투표를 거쳐 선정되었습니다. 그리고 "
            "1982년 5월 지금의 조형물이 세워졌어요. 알고 바라보니 그 자세가 조금 더 "
            "힘차게 느껴지지 않나요? 전북대의 기상을 한번 떠올려 보세요."
        ),
        "docent_leopard_statue": (
            "지금 보고 계신 조형물은 전북대학교를 상징하는 표범상입니다. 학교는 표범이 "
            "지닌 지혜와 용감함, 힘차게 전진하는 모습을 중요한 기상으로 여기는데요. "
            "이 상징은 1981년 약 6천 명이 참여한 투표를 거쳐 선정되었습니다. 이듬해 "
            "5월에는 지금의 조형물이 대학본부 앞에 세워졌어요. 자세를 천천히 바라보세요. "
            "학교가 담고 싶었던 힘찬 기상이 느껴지시나요? 전북대학교의 상징을 기억해 "
            "보세요."
        ),
    }


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
        id="bubbly-proud-senior-story-sample-v5",
        prompt=f"{BUBBLY_DOCENT.prompt}\n\n{ENDING_DIRECTION}",
    )
    tts_service.preset_for = lambda style, locale: preset
    manifest_path = Path(os.environ["TTS_MANIFEST_PATH"])
    next_manifest = copy.deepcopy(load_manifest())

    for position, (entity_id, text) in enumerate(sample_texts().items(), start=1):
        asset_id = f"sample-story:{entity_id}:ko"
        version = "story-prompt-sample-v5"
        content_hash = audio_id_for(text, "ko-KR", "core-docent", version)
        object_name = object_name_for(content_hash, "ko-KR", "core-docent")
        print(json.dumps({"generating": asset_id, "progress": f"{position}/3"}, ensure_ascii=False), flush=True)
        audio = append_trailing_silence(
            tts_service._synthesize_with_google(
                text, "ko-KR", "core-docent", timeout_seconds=60
            )
        )
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
        print(json.dumps({"uploaded": asset_id, "bytes": len(audio)}, ensure_ascii=False), flush=True)

    atomic_save(manifest_path, next_manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
