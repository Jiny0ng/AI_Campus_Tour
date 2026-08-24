from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from models.tts import SynthesizeRequest
from services.audio_storage import AudioStorageUnavailable, load_manifest, read_asset
from services.tts_service import TtsUnavailable, normalize_text, synthesize


router = APIRouter(tags=["공용 음성 안내"])
logger = logging.getLogger(__name__)
_rate_lock = threading.Lock()
_rate_buckets: dict[str, tuple[float, float]] = defaultdict(lambda: (5.0, time.monotonic()))


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _check_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    allowed = {
        value.strip()
        for value in os.getenv("TTS_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    }
    if origin and origin not in allowed:
        raise HTTPException(status_code=403, detail="허용되지 않은 요청 출처입니다.")


def _check_rate_limit(request: Request) -> None:
    key = _client_key(request)
    now = time.monotonic()
    with _rate_lock:
        tokens, updated_at = _rate_buckets[key]
        tokens = min(5.0, tokens + (now - updated_at) * (10.0 / 60.0))
        if tokens < 1.0:
            _rate_buckets[key] = (tokens, now)
            raise HTTPException(
                status_code=429,
                detail="음성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                headers={"Retry-After": "60"},
            )
        _rate_buckets[key] = (tokens - 1.0, now)


@router.post("/tts/synthesize")
async def synthesize_audio(payload: SynthesizeRequest, request: Request):
    _check_origin(request)
    _check_rate_limit(request)
    # FastAPI caches the request body while validating ``payload``, so reading it
    # here does not consume the stream. Check the original JSON rather than the
    # Pydantic projection: otherwise a large unknown field would evade the cap.
    if len(await request.body()) > 8_192:
        raise HTTPException(status_code=413, detail="음성 요청 본문이 너무 큽니다.")
    started = time.monotonic()
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    try:
        result = synthesize(
            payload.text,
            payload.locale,
            payload.style,
            payload.contentVersion,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except TtsUnavailable as error:
        raise HTTPException(status_code=503, detail="음성 안내를 준비할 수 없습니다.") from error

    logger.info(
        json.dumps(
            {
                "request_id": request_id,
                "audio_id": result.audio_id,
                "category": payload.style,
                "locale": payload.locale,
                "cache_status": result.cache_status,
                "text_length": len(normalize_text(payload.text)),
                "synthesis_ms": result.synthesis_ms,
                "storage_read_ms": result.storage_read_ms,
                "total_ms": round((time.monotonic() - started) * 1000),
                "outcome": "success",
            },
            ensure_ascii=False,
        )
    )
    return Response(
        result.content,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "private, max-age=86400",
            "X-Audio-Cache": result.cache_status,
            "X-Audio-Id": result.audio_id,
        },
    )


@router.get("/tts/assets/{asset_id}")
def get_audio_asset(asset_id: str):
    if not asset_id or len(asset_id) > 160 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:" for char in asset_id):
        raise HTTPException(status_code=404, detail="음성 파일을 찾을 수 없습니다.")
    try:
        manifest = load_manifest()
        asset_meta = manifest["assets"].get(asset_id)
        stored = read_asset(asset_id)
    except (AudioStorageUnavailable, ValueError) as error:
        raise HTTPException(status_code=503, detail="음성 저장소를 사용할 수 없습니다.") from error
    if stored is None or not isinstance(asset_meta, dict):
        raise HTTPException(status_code=404, detail="음성 파일을 찾을 수 없습니다.")
    headers = {
        "Cache-Control": "private, max-age=604800",
        # Lets the frontend distinguish an already-generated GCS asset from a
        # real-time synthesis delay when assessing network quality.
        "X-Audio-Cache": "HIT",
    }
    if stored.etag:
        headers["ETag"] = stored.etag
    return Response(stored.content, media_type="audio/mpeg", headers=headers)


@router.get("/health/network")
def network_health():
    return {
        "status": "ok",
        "serverTime": datetime.now(timezone.utc).isoformat(),
    }
