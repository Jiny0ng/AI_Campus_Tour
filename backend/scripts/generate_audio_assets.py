#!/usr/bin/env python3
"""Validate and optionally generate managed CampusTour audio assets.

Dry-run is the default. Use --apply only from an authenticated operator or CI job.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = BACKEND_DIR.parent
CONTENT_DIR = REPOSITORY_DIR / "campusdata" / "audio_content"
MANIFEST_PATH = CONTENT_DIR / "audio_manifest.json"
PLACES_PATH = REPOSITORY_DIR / "campusdata" / "campus_places.csv"
SYSTEM_PUBLIC_DIR = Path(
    os.getenv(
        "AUDIO_SYSTEM_PUBLIC_DIR",
        str(REPOSITORY_DIR / "frontend" / "public" / "audio" / "system"),
    )
)
sys.path.insert(0, str(BACKEND_DIR))

from services.audio_storage import is_configured, read_object, write_object  # noqa: E402
from services.tts_service import (  # noqa: E402
    TtsUnavailable,
    _synthesize_with_google,
    audio_id_for,
    normalize_text,
    object_name_for,
)


LOCALES = {"ko-KR", "en-US", "ja-JP", "cmn-CN"}
DISTANCE_BUCKETS = (30, 50, 100, 200, 300, 500)


def save_manifest(manifest: dict) -> None:
    """Persist progress after every asset so a transient API error is resumable."""
    temporary_path = MANIFEST_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(MANIFEST_PATH)


def synthesize_with_retry(text: str, locale: str, style: str) -> bytes:
    delays = (2, 5)
    for attempt in range(len(delays) + 1):
        try:
            return _synthesize_with_google(text, locale, style)
        except TtsUnavailable:
            if attempt >= len(delays):
                raise
            time.sleep(delays[attempt])
    raise AssertionError("unreachable")


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig") as file:
        return [dict(row) for row in csv.DictReader(file)]


def managed_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for filename in ("fillers.csv", "system_messages.csv", "navigation_templates.csv"):
        path = CONTENT_DIR / filename
        for row in read_rows(path):
            if row.get("enabled", "true").lower() not in {"1", "true", "yes"}:
                continue
            template = row.get("text", "")
            distances = DISTANCE_BUCKETS if "{distance}" in template else (None,)
            for distance in distances:
                expanded = dict(row)
                suffix = "" if distance is None else f":{distance}"
                expanded["id"] = f"{row['id']}{suffix}"
                expanded["text"] = template if distance is None else template.format(distance=distance)
                rows.append(expanded)
            nearby_text = row.get("near_text", "").strip()
            if "{distance}" in template and nearby_text:
                nearby = dict(row)
                nearby["text"] = nearby_text
                rows.append(nearby)
    return rows


def core_docent_rows() -> tuple[list[dict[str, str]], list[str]]:
    rows: list[dict[str, str]] = []
    errors: list[str] = []
    for row in read_rows(PLACES_PATH):
        entity_type = row.get("entity_type")
        if entity_type not in {"tour_stop", "docent_spot"}:
            continue
        text = normalize_text(row.get("docent_text", ""))
        if not text:
            if entity_type == "tour_stop":
                errors.append(f"tour stop {row.get('id')} ({row.get('name')}) has no reviewed docent_text")
            continue
        rows.append(
            {
                "id": f"core-docent:{row['id']}:ko",
                "locale": "ko-KR",
                "text": text,
                "style": "core-docent",
                "content_version": "v1",
            }
        )
    return rows, errors


def validate(rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    for index, row in enumerate(rows, start=1):
        asset_id = row.get("id", "").strip()
        locale = row.get("locale", "").strip()
        text = normalize_text(row.get("text", ""))
        if not asset_id or asset_id in seen:
            errors.append(f"row {index}: missing or duplicate id {asset_id!r}")
        seen.add(asset_id)
        if locale not in LOCALES:
            errors.append(f"{asset_id}: unsupported locale {locale!r}")
        if not 1 <= len(text) <= 500:
            errors.append(f"{asset_id}: text must be 1..500 characters")
        if row.get("style") not in {
            "navigation", "arrival", "system", "filler", "core-docent"
        }:
            errors.append(f"{asset_id}: unsupported managed asset style")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--allow-missing-core-docent",
        action="store_true",
        help="Generate other assets while reporting missing tour-stop scripts.",
    )
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    rows = managed_rows()
    docent_rows, docent_errors = core_docent_rows()
    rows.extend(docent_rows)
    errors = validate(rows) + docent_errors

    planned = []
    for row in rows:
        text = normalize_text(row["text"])
        version = row.get("content_version", "v1")
        audio_id = audio_id_for(text, row["locale"], row["style"], version)
        object_name = object_name_for(audio_id, row["locale"], row["style"])
        existing = manifest["assets"].get(row["id"])
        if isinstance(existing, dict) and existing.get("audioId") == audio_id:
            continue
        planned.append((row, text, version, audio_id, object_name))

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "managedAssets": len(rows),
        "changes": len(planned),
        "validationErrors": errors,
    }, ensure_ascii=False, indent=2))

    blocking_errors = [error for error in errors if "has no reviewed docent_text" not in error]
    if docent_errors and not args.allow_missing_core_docent:
        blocking_errors.extend(docent_errors)
    if blocking_errors:
        return 1
    if not args.apply:
        return 0
    if not is_configured():
        print("TTS_BUCKET_NAME is required when --apply is used", file=sys.stderr)
        return 1

    local_system_files: set[str] = set()
    reused_objects = 0
    for completed, (row, text, version, audio_id, object_name) in enumerate(planned, start=1):
        stored = read_object(object_name)
        if stored is not None:
            content = stored.content
            reused_objects += 1
        else:
            content = synthesize_with_retry(text, row["locale"], row["style"])
            write_object(
                object_name,
                content,
                {
                    "content_hash": audio_id,
                    "locale": row["locale"],
                    "style": row["style"],
                    "content_version": version,
                },
            )
        manifest["assets"][row["id"]] = {
            "audioId": audio_id,
            "objectName": object_name,
            "locale": row["locale"],
            "style": row["style"],
            "contentVersion": version,
        }
        if row["style"] == "system":
            parts = row["id"].split(":")
            if len(parts) == 3:
                SYSTEM_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
                local_path = SYSTEM_PUBLIC_DIR / f"{parts[1]}-{parts[2]}.mp3"
                local_path.write_bytes(content)
                local_system_files.add(local_path.name)
                manifest["assets"][row["id"]]["localPath"] = str(
                    local_path.relative_to(SYSTEM_PUBLIC_DIR.parent.parent)
                )
        save_manifest(manifest)
        print(json.dumps({
            "completed": completed,
            "total": len(planned),
            "assetId": row["id"],
            "storage": "reused" if stored is not None else "created",
        }, ensure_ascii=False), flush=True)

    system_manifest_path = SYSTEM_PUBLIC_DIR / "manifest.json"
    existing_local_files = {
        path.name for path in system_manifest_path.parent.glob("*.mp3")
    }
    system_manifest_path.write_text(
        json.dumps({"available": sorted(existing_local_files | local_system_files)}, indent=2) + "\n",
        encoding="utf-8",
    )

    save_manifest(manifest)
    print(json.dumps({"reusedStoredAssets": reused_objects}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
