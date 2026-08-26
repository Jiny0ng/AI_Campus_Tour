#!/usr/bin/env python3
"""Delete legacy Flash/MP3 audio only after the Pro/WAV manifest is complete."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = BACKEND_DIR.parent
MANIFEST_PATH = REPOSITORY_DIR / "campusdata" / "audio_content" / "audio_manifest.json"
sys.path.insert(0, str(BACKEND_DIR))

from services.audio_storage import delete_object, list_objects, read_object  # noqa: E402
from services.tts_presets import BUBBLY_DOCENT  # noqa: E402


def legacy_object(name: str, metadata: dict[str, str]) -> bool:
    model = metadata.get("model", "").lower()
    preset = metadata.get("preset", "")
    return (
        name.lower().endswith(".mp3")
        or "flash" in model
        or (preset.startswith("legacy-") and preset != BUBBLY_DOCENT.id)
    )


def validated_active_objects() -> set[str]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assets = manifest.get("assets")
    if not isinstance(assets, dict) or not assets:
        raise RuntimeError("active audio manifest is empty")
    protected: set[str] = set()
    selected_assets: dict[str, dict] = {}
    errors: list[str] = []
    for asset_id, asset in assets.items():
        if not isinstance(asset, dict):
            errors.append(f"{asset_id}: invalid manifest entry")
            continue
        object_name = str(asset.get("objectName", ""))
        if not object_name.endswith(".wav") or asset.get("preset") != BUBBLY_DOCENT.id:
            # Old manifests can contain entries that are no longer produced.
            # They are removed from the active manifest only after the complete
            # generation commands succeeded and invoked this cleanup step.
            continue
        if object_name and read_object(object_name) is None:
            errors.append(f"{asset_id}: active object is missing: {object_name}")
        protected.add(object_name)
        selected_assets[asset_id] = asset
    if len(selected_assets) < 1:
        errors.append("no Pro/WAV assets were generated")
    if errors:
        raise RuntimeError("\n".join(errors))
    temporary_path = MANIFEST_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps({**manifest, "assets": selected_assets}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(MANIFEST_PATH)
    return protected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    protected = validated_active_objects()
    candidates = [
        item for item in list_objects()
        if item.name not in protected and legacy_object(item.name, item.metadata)
    ]
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "activeProWavAssets": len(protected),
        "legacyObjects": [item.name for item in candidates],
    }, ensure_ascii=False, indent=2))
    if args.apply:
        for item in candidates:
            delete_object(item.name)
            print(json.dumps({"deleted": item.name}, ensure_ascii=False), flush=True)

        remaining = [
            item.name for item in list_objects()
            if item.name not in protected and legacy_object(item.name, item.metadata)
        ]
        if remaining:
            raise RuntimeError(f"legacy objects remain after cleanup: {remaining}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
