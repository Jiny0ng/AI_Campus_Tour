import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter(prefix="/directions", tags=["자동차 길찾기"])

DIRECTIONS_URL = "https://maps.apigw.ntruss.com/map-direction/v1/driving"


class Coordinate(BaseModel):
    lat: float
    lng: float


class DrivingRouteRequest(BaseModel):
    start: Coordinate
    goal: Coordinate


@router.post("/driving")
def get_driving_route(payload: DrivingRouteRequest):
    client_id = os.getenv("NAVER_MAP_CLIENT_ID")
    client_secret = os.getenv("NAVER_MAP_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail="NAVER Maps Directions 인증 정보가 설정되지 않았습니다.",
        )

    query = urlencode({
        "start": f"{payload.start.lng},{payload.start.lat}",
        "goal": f"{payload.goal.lng},{payload.goal.lat}",
        "option": "trafast",
    })
    request = Request(
        f"{DIRECTIONS_URL}?{query}",
        headers={
            "x-ncp-apigw-api-key-id": client_id,
            "x-ncp-apigw-api-key": client_secret,
        },
        method="GET",
    )

    try:
        with urlopen(request, timeout=10) as response:
            result = json.load(response)
    except HTTPError as error:
        raise HTTPException(status_code=502, detail="NAVER Directions 요청이 실패했습니다.") from error
    except (URLError, TimeoutError) as error:
        raise HTTPException(status_code=504, detail="NAVER Directions 응답이 지연되고 있습니다.") from error

    if result.get("code") != 0:
        raise HTTPException(
            status_code=422,
            detail=result.get("message", "자동차 경로를 찾을 수 없습니다."),
        )

    routes = result.get("route", {}).get("trafast", [])
    if not routes:
        raise HTTPException(status_code=422, detail="자동차 경로 결과가 없습니다.")

    route = routes[0]
    summary = route.get("summary", {})
    return {
        "path": [
            {"lat": coordinate[1], "lng": coordinate[0]}
            for coordinate in route.get("path", [])
        ],
        "distanceMeters": summary.get("distance", 0),
        "durationMilliseconds": summary.get("duration", 0),
    }
