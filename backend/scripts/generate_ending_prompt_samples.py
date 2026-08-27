#!/usr/bin/env python3
"""Generate isolated ending-prompt samples without replacing active assets."""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
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

추가 마무리 연기 지시:
문장의 마지막 모음은 과도하게 늘이지 않는다. 다만 마지막 음절을 짧게 잘라 먹거나
급하게 끝내지 말고, 자연스러운 호흡과 완만한 하강 억양으로 차분하게 마무리한다.
안내 전체의 마지막 문장에서도 말하는 속도를 갑자기 높이지 말고 평소 속도를 유지한다.
마지막 음절까지 또렷하게 발음한 뒤 짧은 여유가 느껴지도록 끝낸다.
""".strip()


def sample_texts() -> dict[str, str]:
    return {
        "tour_01_new_gate": (
            "지금 보고 계신 곳은 전북대학교의 신정문입니다. 전북대학교의 정문이자 "
            "가장 한국적인 캠퍼스를 상징하는 공간인데요. 2019년에 완공된 신정문은 "
            "전통 한옥 형태로 설계되어 학교에 들어서는 순간부터 전북대만의 인상을 "
            "전해 줍니다. 중앙에 있는 전북대학교 현판도 한번 살펴보세요. 당시 중문과 "
            "김병기 교수가 직접 쓴 글씨라고 하는데요. 그 이야기를 알고 나니 현판이 "
            "조금 다르게 보이지 않나요? 안으로 들어가기 전에 한옥의 형태와 현판을 "
            "천천히 바라보며 신정문의 첫인상을 남겨보세요."
        ),
        "tour_03_university_headquarters": (
            "지금 보고 계신 곳은 전북대학교의 행정 중심인 대학본부입니다. 총장실과 "
            "주요 행정부서가 모여 있어 학교의 중요한 일들이 이곳에서 이어지는데요. "
            "건물 앞을 바라보면 전북대학교의 상징동물인 표범상도 만날 수 있습니다. "
            "표범의 지혜와 용감함, 그리고 과감하게 앞으로 나아가는 모습에는 전북대인이 "
            "지향하는 품성과 기상이 담겨 있어요. 표범은 1981년 약 6천 명의 구성원과 "
            "동문이 참여한 설문조사와 투표를 통해 상징동물로 선정되었고, 이듬해인 "
            "1982년 5월 지금의 표범상이 세워졌습니다. 이런 이야기를 알고 바라보니 "
            "표범의 자세가 조금 더 힘차게 느껴지지 않나요? 대학본부를 지나기 전에 "
            "표범상에 담긴 전북대의 기상을 한번 떠올려보세요."
        ),
        "docent_leopard_statue": (
            "지금 보고 계신 조형물은 전북대학교의 상징동물인 표범을 표현한 표범상입니다. "
            "전북대학교는 표범의 지혜와 용감함, 과감하게 전진하는 모습을 학교 구성원이 "
            "지향하는 품성과 기상으로 여기고 있는데요. 표범은 1981년 약 6천 명의 "
            "구성원과 동문이 참여한 설문조사와 투표를 거쳐 상징동물로 선정되었습니다. "
            "그리고 개교 30주년을 맞은 1982년 5월, 지금의 표범상이 대학본부 앞에 "
            "세워졌어요. 표범의 자세를 한번 자세히 바라보세요. 학교가 이 조형물에 "
            "담고 싶었던 힘찬 기상이 느껴지시나요? 지나가기 전에 표범상과 함께 "
            "전북대학교의 상징을 기억해보세요."
        ),
    }


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
        id="bubbly-proud-senior-story-sample-v2",
        prompt=f"{BUBBLY_DOCENT.prompt}\n\n{ENDING_DIRECTION}",
    )
    tts_service.preset_for = lambda style, locale: preset
    manifest_path = Path(os.environ["TTS_MANIFEST_PATH"])
    next_manifest = copy.deepcopy(load_manifest())

    for position, (entity_id, text) in enumerate(sample_texts().items(), start=1):
        asset_id = f"sample-story:{entity_id}:ko"
        version = "story-prompt-sample-v2"
        content_hash = audio_id_for(text, "ko-KR", "core-docent", version)
        object_name = object_name_for(content_hash, "ko-KR", "core-docent")
        print(json.dumps({"generating": asset_id, "progress": f"{position}/3"}, ensure_ascii=False), flush=True)
        audio = tts_service._synthesize_with_google(
            text, "ko-KR", "core-docent", timeout_seconds=60
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
