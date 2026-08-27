#!/usr/bin/env python3
"""Generate isolated ending-prompt samples without replacing active assets."""

from __future__ import annotations

import argparse
import copy
import csv
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
추가 마무리 연기 지시:
문장의 마지막 모음은 과도하게 늘이지 않는다. 다만 마지막 음절을 짧게 잘라 먹거나
급하게 끝내지 말고, 자연스러운 호흡과 완만한 하강 억양으로 차분하게 마무리한다.
안내 전체의 마지막 문장에서도 말하는 속도를 갑자기 높이지 말고 평소 속도를 유지한다.
마지막 음절까지 또렷하게 발음한 뒤 짧은 여유가 느껴지도록 끝낸다.
""".strip()


def sample_texts() -> dict[str, str]:
    generated = json.loads(
        (REPOSITORY_DIR / "campusdata/audio_content/generated_docents.json").read_text(encoding="utf-8")
    )["scripts"]
    with (REPOSITORY_DIR / "campusdata/campus_places.csv").open(
        encoding="utf-8-sig", newline=""
    ) as file:
        places = {row["id"]: row for row in csv.DictReader(file)}
    return {
        "tour_01_new_gate": generated["tour_01_new_gate"]["text"],
        "tour_03_university_headquarters": generated["tour_03_university_headquarters"]["text"],
        "docent_leopard_statue": places["docent_leopard_statue"]["docent_text"],
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
        id="bubbly-proud-senior-ending-sample-v1",
        prompt=f"{BUBBLY_DOCENT.prompt}\n\n{ENDING_DIRECTION}",
    )
    tts_service.preset_for = lambda style, locale: preset
    manifest_path = Path(os.environ["TTS_MANIFEST_PATH"])
    next_manifest = copy.deepcopy(load_manifest())

    for position, (entity_id, text) in enumerate(sample_texts().items(), start=1):
        asset_id = f"sample-ending:{entity_id}:ko"
        version = "ending-prompt-sample-v1"
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
