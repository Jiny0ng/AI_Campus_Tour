#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from pathlib import Path


MANIFEST_PATH = Path(
    os.getenv(
        "TTS_MANIFEST_PATH",
        Path(__file__).resolve().parents[2] / "campusdata/audio_content/audio_manifest.json",
    )
)
GENERATED_DOCENTS_PATH = MANIFEST_PATH.parent / "generated_docents.json"


def main() -> int:
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
    if GENERATED_DOCENTS_PATH.is_file():
        generated = json.loads(GENERATED_DOCENTS_PATH.read_text(encoding="utf-8"))
        scripts = generated.get("scripts", {})
        if generated.get("version") != 1 or not isinstance(scripts, dict):
            errors.append("generated_docents:invalid-root")
        else:
            for entity_id, script in scripts.items():
                if not isinstance(script, dict) or script.get("status") != "active":
                    continue
                asset_id = f"core-docent:{entity_id}:ko"
                asset = assets.get(asset_id)
                if not isinstance(asset, dict):
                    errors.append(f"{asset_id}:missing-for-active-script")
                elif asset.get("contentVersion") != script.get("contentVersion"):
                    errors.append(f"{asset_id}:content-version-mismatch")
    print(json.dumps({"assets": len(assets), "invalid": errors}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
