from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


MANIFEST_PATH = Path(
    os.getenv(
        "TTS_MANIFEST_PATH",
        "/campusdata/audio_content/audio_manifest.json",
    )
)


class AudioStorageUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class StoredAudio:
    content: bytes
    etag: str | None = None


@lru_cache(maxsize=1)
def _storage_client():
    try:
        from google.cloud import storage
    except ImportError as error:
        raise AudioStorageUnavailable("google-cloud-storage is not installed") from error
    return storage.Client(project=os.getenv("GCP_PROJECT_ID") or None)


def bucket_name() -> str:
    return os.getenv("TTS_BUCKET_NAME", "").strip()


def is_configured() -> bool:
    return bool(bucket_name())


def read_object(object_name: str, timeout: float = 5.0) -> StoredAudio | None:
    if not is_configured():
        return None
    try:
        blob = _storage_client().bucket(bucket_name()).blob(object_name)
        if not blob.exists(timeout=timeout):
            return None
        content = blob.download_as_bytes(timeout=timeout)
        return StoredAudio(content=content, etag=blob.etag)
    except AudioStorageUnavailable:
        raise
    except Exception as error:
        raise AudioStorageUnavailable("Cloud Storage read failed") from error


def write_object(
    object_name: str,
    content: bytes,
    metadata: dict[str, str],
    timeout: float = 5.0,
) -> None:
    if not is_configured():
        return
    try:
        blob = _storage_client().bucket(bucket_name()).blob(object_name)
        blob.metadata = metadata
        blob.upload_from_string(content, content_type="audio/mpeg", timeout=timeout)
    except AudioStorageUnavailable:
        raise
    except Exception as error:
        raise AudioStorageUnavailable("Cloud Storage write failed") from error


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.is_file():
        return {"version": 1, "assets": {}}
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict) or not isinstance(payload.get("assets"), dict):
        raise ValueError("audio manifest must contain an assets object")
    return payload


def read_asset(asset_id: str) -> StoredAudio | None:
    asset = load_manifest()["assets"].get(asset_id)
    if not isinstance(asset, dict):
        return None
    object_name = asset.get("objectName")
    if not isinstance(object_name, str) or not object_name:
        return None
    return read_object(object_name)

