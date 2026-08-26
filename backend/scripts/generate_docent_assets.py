#!/usr/bin/env python3
"""Generate, validate, synthesize, and atomically activate docent assets."""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = BACKEND_DIR.parent
DATA_DIR = REPOSITORY_DIR / "campusdata"
CONTENT_DIR = DATA_DIR / "audio_content"
REGISTRY_PATH = CONTENT_DIR / "generated_docents.json"
PENDING_REGISTRY_PATH = CONTENT_DIR / "generated_docents.pending.json"
MANIFEST_PATH = CONTENT_DIR / "audio_manifest.json"
sys.path.insert(0, str(BACKEND_DIR))

from services.audio_storage import is_configured, read_object, write_object  # noqa: E402
from services.tts_presets import preset_for  # noqa: E402
from services.docent_generation import (  # noqa: E402
    content_fingerprint,
    generate_and_validate,
    load_docent_specs,
)
from services.tts_service import (  # noqa: E402
    TtsUnavailable,
    _synthesize_with_google,
    audio_id_for,
    object_name_for,
)


def load_json(path: Path, fallback: dict) -> dict:
    if not path.is_file():
        return copy.deepcopy(fallback)
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_save(path: Path, payload: dict) -> None:
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def exception_details(error: BaseException) -> str:
    details = []
    current: BaseException | None = error
    while current is not None:
        message = str(current).strip()
        details.append(
            f"{type(current).__name__}: {message}"
            if message
            else type(current).__name__
        )
        current = current.__cause__
    return " <- ".join(details)


def synthesize_with_retry(
    text: str,
    *,
    entity_id: str,
    position: int,
    total: int,
) -> bytes:
    delays = (2, 5)
    timeout_seconds = float(os.getenv("TTS_BATCH_TIMEOUT_SECONDS", "60"))
    for attempt in range(len(delays) + 1):
        attempt_started = time.monotonic()
        print(json.dumps({
            "ttsStarted": entity_id,
            "progress": f"{position}/{total}",
            "attempt": attempt + 1,
            "maxAttempts": len(delays) + 1,
            "timeoutSeconds": timeout_seconds,
            "characters": len(text),
        }, ensure_ascii=False), flush=True)
        try:
            content = _synthesize_with_google(
                text,
                "ko-KR",
                "core-docent",
                timeout_seconds=timeout_seconds,
            )
            print(json.dumps({
                "ttsSynthesized": entity_id,
                "progress": f"{position}/{total}",
                "attempt": attempt + 1,
                "elapsedSeconds": round(time.monotonic() - attempt_started, 2),
                "audioBytes": len(content),
            }, ensure_ascii=False), flush=True)
            return content
        except TtsUnavailable as error:
            elapsed = round(time.monotonic() - attempt_started, 2)
            if attempt >= len(delays):
                print(json.dumps({
                    "ttsFailed": entity_id,
                    "progress": f"{position}/{total}",
                    "attempt": attempt + 1,
                    "elapsedSeconds": elapsed,
                    "error": exception_details(error),
                }, ensure_ascii=False), file=sys.stderr, flush=True)
                raise
            delay = delays[attempt]
            print(json.dumps({
                "ttsRetrying": entity_id,
                "progress": f"{position}/{total}",
                "attempt": attempt + 1,
                "elapsedSeconds": elapsed,
                "retryInSeconds": delay,
                "error": exception_details(error),
            }, ensure_ascii=False), file=sys.stderr, flush=True)
            time.sleep(delay)
    raise AssertionError("unreachable")


def make_llm(model: str):
    from langchain_google_genai import ChatGoogleGenerativeAI

    # Gemini 3.x uses part of this budget for reasoning. A 1,024-token cap can
    # truncate even short structured responses before the JSON object closes.
    return ChatGoogleGenerativeAI(model=model, max_output_tokens=4096)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Call Gemini and Cloud TTS, upload assets, and activate the new registry.",
    )
    args = parser.parse_args()

    model = os.getenv("DOCENT_SCRIPT_MODEL", "gemini-3.6-flash")
    prompt_version = os.getenv("DOCENT_SCRIPT_PROMPT_VERSION", "v2")
    specs = load_docent_specs(DATA_DIR)
    registry = load_json(REGISTRY_PATH, {"version": 1, "scripts": {}})
    pending_registry = load_json(PENDING_REGISTRY_PATH, {"version": 1, "scripts": {}})
    manifest = load_json(MANIFEST_PATH, {"version": 1, "assets": {}})
    existing_scripts = registry.setdefault("scripts", {})
    pending_scripts = pending_registry.get("scripts", {})

    stale_specs = []
    reusable = {}
    for spec in specs:
        fingerprint = content_fingerprint(spec, model, prompt_version)
        existing = existing_scripts.get(spec.entity_id)
        pending = pending_scripts.get(spec.entity_id)
        if (
            isinstance(existing, dict)
            and existing.get("status") == "active"
            and existing.get("contentFingerprint") == fingerprint
            and isinstance(existing.get("text"), str)
        ):
            reusable[spec.entity_id] = existing
        elif (
            isinstance(pending, dict)
            and pending.get("contentFingerprint") == fingerprint
            and isinstance(pending.get("text"), str)
        ):
            reusable[spec.entity_id] = {**pending, "status": "active"}
        else:
            stale_specs.append((spec, fingerprint))

    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "docentConfigs": len(specs),
        "scriptsToGenerate": len(stale_specs),
        "reusableScripts": len(reusable),
    }, ensure_ascii=False, indent=2))
    if not args.apply:
        return 0
    if not os.getenv("GOOGLE_API_KEY", "").strip():
        print("GOOGLE_API_KEY is required when --apply is used", file=sys.stderr)
        return 1
    if not is_configured():
        print("TTS_BUCKET_NAME is required when --apply is used", file=sys.stderr)
        return 1

    # Generate and validate every stale script before uploading or activating any
    # new version. A single invalid script leaves the current production set intact.
    candidates = dict(reusable)
    if stale_specs:
        llm = make_llm(model)
        for spec, fingerprint in stale_specs:
            last_error: Exception | None = None
            for attempt in range(2):
                try:
                    text, used_fact_ids = generate_and_validate(spec, llm)
                    break
                except Exception as error:
                    last_error = error
                    if attempt == 1:
                        print(
                            f"Docent generation failed for {spec.entity_id}: {error}",
                            file=sys.stderr,
                        )
                        return 1
            else:
                raise AssertionError(last_error)
            candidates[spec.entity_id] = {
                "status": "active",
                "text": text,
                "contentFingerprint": fingerprint,
                "contentVersion": fingerprint[:16],
                "model": model,
                "promptVersion": prompt_version,
                "usedFactIds": used_fact_ids,
                "targetDurationSeconds": spec.target_duration_seconds,
                "validatedAt": datetime.now(timezone.utc).isoformat(),
            }
            print(json.dumps({
                "generated": spec.entity_id,
                "characters": len(text),
                "usedFacts": len(used_fact_ids),
            }, ensure_ascii=False), flush=True)

    # Persist validated scripts before the slower TTS phase. This file is not
    # served by the application; it only lets a failed batch resume without
    # paying for and varying the same Gemini generations again.
    atomic_save(PENDING_REGISTRY_PATH, {"version": 1, "scripts": candidates})

    next_manifest = copy.deepcopy(manifest)
    next_registry = {"version": 1, "scripts": copy.deepcopy(existing_scripts)}
    next_registry["scripts"].update(candidates)
    uploaded = 0
    reused_audio = 0
    total_specs = len(specs)
    for position, spec in enumerate(specs, start=1):
        script = candidates[spec.entity_id]
        text = script["text"]
        content_version = script["contentVersion"]
        audio_id = audio_id_for(text, "ko-KR", "core-docent", content_version)
        object_name = object_name_for(audio_id, "ko-KR", "core-docent")
        print(json.dumps({
            "ttsCheckingStorage": spec.entity_id,
            "progress": f"{position}/{total_specs}",
            "objectName": object_name,
        }, ensure_ascii=False), flush=True)
        stored = read_object(object_name)
        if stored is None:
            try:
                content = synthesize_with_retry(
                    text,
                    entity_id=spec.entity_id,
                    position=position,
                    total=total_specs,
                )
            except TtsUnavailable:
                return 1
            preset = preset_for("core-docent", "ko-KR")
            write_object(
                object_name,
                content,
                {
                    "content_hash": audio_id,
                    "entity_id": spec.entity_id,
                    "locale": "ko-KR",
                    "style": "core-docent",
                    "content_version": content_version,
                    "media_type": preset.media_type,
                    "preset": preset.id,
                    "script_model": model,
                    "script_prompt_version": prompt_version,
                },
            )
            uploaded += 1
            print(json.dumps({
                "ttsUploaded": spec.entity_id,
                "progress": f"{position}/{total_specs}",
                "objectName": object_name,
                "audioBytes": len(content),
            }, ensure_ascii=False), flush=True)
        else:
            reused_audio += 1
            print(json.dumps({
                "ttsReused": spec.entity_id,
                "progress": f"{position}/{total_specs}",
                "objectName": object_name,
            }, ensure_ascii=False), flush=True)
        next_manifest["assets"][f"core-docent:{spec.entity_id}:ko"] = {
            "audioId": audio_id,
            "objectName": object_name,
            "locale": "ko-KR",
            "style": "core-docent",
            "contentVersion": content_version,
            "mediaType": preset_for("core-docent", "ko-KR").media_type,
            "preset": preset_for("core-docent", "ko-KR").id,
        }

    # Activate only after every script passed both validators and every audio
    # object is confirmed present in storage.
    atomic_save(REGISTRY_PATH, next_registry)
    atomic_save(MANIFEST_PATH, next_manifest)
    PENDING_REGISTRY_PATH.unlink(missing_ok=True)
    print(json.dumps({
        "activatedDocents": len(specs),
        "uploadedAudio": uploaded,
        "reusedAudio": reused_audio,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
