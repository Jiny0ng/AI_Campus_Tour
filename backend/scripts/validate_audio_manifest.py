#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


MANIFEST_PATH = Path(
    os.getenv(
        "TTS_MANIFEST_PATH",
        Path(__file__).resolve().parents[2] / "campusdata/audio_content/audio_manifest.json",
    )
)
GENERATED_DOCENTS_PATH = MANIFEST_PATH.parent / "generated_docents.json"
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from services.audio_storage import read_object  # noqa: E402
from services.tts_presets import BUBBLY_DOCENT  # noqa: E402


SUPPORTED_LANGUAGES = ("ko", "en", "ja", "zh")
LOCALE_CODES = {"ko": "ko-KR", "en": "en-US", "ja": "ja-JP", "zh": "cmn-CN"}
REQUIRED_SYSTEM_ASSETS = {
    f"system:first-stop-microphone-tip:{language}" for language in SUPPORTED_LANGUAGES
}


def is_review_sample(asset_id: str) -> bool:
    return asset_id.startswith(("sample-ending:", "sample-story:"))


def is_legacy_manifest_asset(asset: dict) -> bool:
    return str(asset.get("objectName", "")).lower().endswith(".mp3")


def required_asset_errors(assets: dict, scripts: dict) -> list[str]:
    errors: list[str] = []
    for entity_id, script in scripts.items():
        if not isinstance(script, dict) or script.get("status") != "active":
            continue
        expected = ["en-route-docent"]
        if script.get("arrivalEnabled"):
            expected.append("arrival-docent")
        translations = script.get("translations")
        if not isinstance(translations, dict):
            errors.append(f"{entity_id}:missing-translations")
            continue
        for language in SUPPORTED_LANGUAGES:
            if not isinstance(translations.get(language), dict):
                errors.append(f"{entity_id}:{language}:missing-translation")
                continue
            for style in expected:
                asset_id = f"{style}:{entity_id}:{language}"
                asset = assets.get(asset_id)
                if not isinstance(asset, dict):
                    errors.append(f"{asset_id}:missing-for-active-script")
                elif asset.get("contentVersion") != script.get("contentVersion"):
                    errors.append(f"{asset_id}:content-version-mismatch")
                elif asset.get("language") != language:
                    errors.append(f"{asset_id}:language-mismatch")
                elif asset.get("locale") != LOCALE_CODES[language]:
                    errors.append(f"{asset_id}:locale-mismatch")
    for asset_id in sorted(REQUIRED_SYSTEM_ASSETS):
        if not isinstance(assets.get(asset_id), dict):
            errors.append(f"{asset_id}:missing-required-system-asset")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-pro-wav", action="store_true")
    parser.add_argument("--check-storage", action="store_true")
    args = parser.parse_args()
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assets = payload.get("assets")
    if payload.get("version") != 1 or not isinstance(assets, dict):
        print("invalid audio manifest root")
        return 1
    required = {"audioId", "objectName", "locale", "style", "contentVersion"}
    errors = []
    for asset_id, asset in assets.items():
        if not isinstance(asset, dict) or not required.issubset(asset):
            errors.append(asset_id)
            continue
        # Listening-review samples deliberately use isolated prompt IDs and are
        # never requested by the application. Production preset enforcement is
        # limited to actual navigation/docent assets.
        if is_review_sample(asset_id):
            continue
        # Old manifests can retain inactive MP3 entries until the explicit
        # cleanup job removes their storage objects. Required active assets are
        # checked separately below, so legacy entries must not block rollout.
        if is_legacy_manifest_asset(asset):
            continue
        object_name = str(asset.get("objectName", ""))
        if args.require_pro_wav and (
            not object_name.endswith(".wav")
            or asset.get("preset") != BUBBLY_DOCENT.id
        ):
            errors.append(f"{asset_id}:not-pro-wav")
        elif args.check_storage and read_object(object_name) is None:
            errors.append(f"{asset_id}:missing-storage-object")
    scripts = {}
    if GENERATED_DOCENTS_PATH.is_file():
        generated = json.loads(GENERATED_DOCENTS_PATH.read_text(encoding="utf-8"))
        scripts = generated.get("scripts", {})
        if generated.get("version") != 1 or not isinstance(scripts, dict):
            errors.append("generated_docents:invalid-root")
            scripts = {}
    errors.extend(required_asset_errors(assets, scripts))
    print(json.dumps({"assets": len(assets), "invalid": errors}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
