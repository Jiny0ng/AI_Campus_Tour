from typing import Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from utils.bicycle_routing import get_bicycle_path, path_distance
from utils.routing import get_shortest_path, haversine


router = APIRouter(prefix="/guide", tags=["캠퍼스 안내"])

POPULAR_NAMES = [
    "중앙도서관",
    "학생타운",
    "진수당",
    "건지광장",
    "대학본부",
    "공과대학 1호관",
    "참빛관",
    "후생관",
]


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class LocalRouteRequest(BaseModel):
    start: Coordinate
    goal: Coordinate
    mode: Literal["walk", "bike"]


class NearbyRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    radiusMeters: float = Field(default=250, ge=10, le=500)


def _category(labels, name, detail=""):
    text = f"{name or ''} {detail or ''}".lower()
    if any(keyword in text for keyword in ("주차", "parking")):
        return "parking"
    if any(keyword in text for keyword in ("카페", "커피", "할리스", "cafe")):
        return "cafe"
    if any(keyword in text for keyword in ("편의점", "이마트", "쿱스켓", " cu")):
        return "convenience"
    if any(keyword in text for keyword in ("공원", "휴게", "광장", "정자", "쉼터")):
        return "rest"
    if "Store" in labels:
        return "convenience"
    return "building"


def _destinations(driver, query="", limit=50):
    with driver.session() as session:
        rows = session.run(
            """
            MATCH (n)
            WHERE (n:Building OR n:Facility OR n:Store OR n:Place)
              AND n.name IS NOT NULL
              AND n.latitude IS NOT NULL AND n.longitude IS NOT NULL
              AND ($keyword = '' OR toLower(n.name) CONTAINS toLower($keyword)
                   OR toLower(coalesce(n.alias, '')) CONTAINS toLower($keyword)
                   OR toLower(coalesce(n.description, '')) CONTAINS toLower($keyword)
                   OR toLower(coalesce(n.main_function, '')) CONTAINS toLower($keyword))
            RETURN DISTINCT elementId(n) AS id, labels(n) AS labels, n.name AS name,
                   coalesce(n.description, n.main_function, n.related_content, '') AS description,
                   coalesce(n.type, n.spot_type, '') AS detail,
                   n.latitude AS latitude, n.longitude AS longitude
            ORDER BY name
            LIMIT $limit
            """,
            keyword=query,
            limit=limit,
        )
        results = []
        for row in rows:
            labels = list(row["labels"])
            description = row["description"]
            if isinstance(description, list):
                description = ", ".join(str(value) for value in description)
            results.append({
                "id": row["id"],
                "name": row["name"],
                "description": description or f"{row['name']} 위치 안내",
                "category": _category(labels, row["name"], row["detail"]),
                "labels": labels,
                "coordinate": {"lat": row["latitude"], "lng": row["longitude"]},
            })
    return results


@router.get("/destinations")
def destinations(
    request: Request,
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=30, ge=1, le=50),
):
    results = _destinations(request.app.state.neo4j_driver, q.strip(), limit)
    return {"query": q, "total": len(results), "results": results}


@router.get("/popular")
def popular_destinations(request: Request):
    results = _destinations(request.app.state.neo4j_driver, "", 500)
    by_name = {item["name"]: item for item in results}
    popular = [by_name[name] for name in POPULAR_NAMES if name in by_name]
    return {"total": len(popular), "results": popular}


@router.post("/route")
def local_route(payload: LocalRouteRequest):
    start = payload.start.model_dump()
    goal = payload.goal.model_dump()
    if payload.mode == "bike":
        path = get_bicycle_path(start, goal)
        distance = path_distance(path)
        speed_meters_per_second = 4.2
    else:
        raw_path = get_shortest_path(
            {"x": start["lng"], "y": start["lat"]},
            {"x": goal["lng"], "y": goal["lat"]},
        )
        path = [{"lat": point["y"], "lng": point["x"]} for point in raw_path]
        distance = path_distance(path)
        speed_meters_per_second = 1.3

    return {
        "path": path,
        "guides": [],
        "distanceMeters": distance,
        "durationMilliseconds": round(distance / speed_meters_per_second * 1000),
        "routeStart": start,
        "routeGoal": goal,
        "routeOption": payload.mode,
        "generatedAt": None,
    }


@router.post("/nearby")
def nearby_facilities(payload: NearbyRequest, request: Request):
    candidates = _destinations(request.app.state.neo4j_driver, "", 500)
    allowed = {"cafe", "convenience", "rest", "parking"}
    nearby = []
    for item in candidates:
        if item["category"] not in allowed:
            continue
        coordinate = item["coordinate"]
        distance = haversine(
            payload.latitude,
            payload.longitude,
            coordinate["lat"],
            coordinate["lng"],
        )
        if distance <= payload.radiusMeters:
            nearby.append({**item, "distanceMeters": round(distance)})

    nearby.sort(key=lambda item: item["distanceMeters"])
    return {"radiusMeters": payload.radiusMeters, "results": nearby[:10]}
