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
    print(json.dumps({"assets": len(assets), "invalid": errors}, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

