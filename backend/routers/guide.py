from typing import Literal, Optional
import json
import os
import re
from functools import lru_cache

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from utils.bicycle_routing import get_bicycle_path, path_distance
from utils.navigation_guides import local_guides
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

@lru_cache(maxsize=1)
def _purpose_rules():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "campusdata", "guide_purposes.json")
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


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


def _purposes_for_text(*values):
    text = " ".join(str(value or "") for value in values).lower()
    return [
        purpose for purpose, keywords in _purpose_rules().items()
        if any(
            re.search(rf"(?<![a-z0-9]){re.escape(keyword.lower())}(?![a-z0-9])", text)
            if re.fullmatch(r"[a-z0-9 ]+", keyword.lower())
            else keyword.lower() in text
            for keyword in keywords
        )
    ]


def _facility_purposes(facility):
    purposes = set(_purposes_for_text(
        facility.get("name"), facility.get("type"), facility.get("features"), facility.get("note")
    ))
    identity = f"{facility.get('name') or ''} {facility.get('type') or ''}".lower()
    if not any(keyword in identity for keyword in ("카페", "커피", "할리스", "cafe")):
        purposes.discard("cafe")
    if not any(keyword in identity for keyword in ("편의점", " cu", "cu ", "이마트24", "쿱스켓")):
        purposes.discard("convenience_store")
    return sorted(purposes)


def _facility_summary(facility):
    location = " ".join(
        value for value in (facility.get("floor"), facility.get("name")) if value
    )
    detail = facility.get("features") or facility.get("note") or facility.get("type") or ""
    if location and detail:
        return f"{location}: {detail}"
    return location or detail


def _guide_discovery(driver, purpose: Optional[str] = None, query: str = "", limit: int = 50):
    """Combine structural facilities and editorial facts into one place-level result."""
    with driver.session() as session:
        places = [dict(row) for row in session.run(
            """
            MATCH (place)
            WHERE (place:Building OR place:Place)
              AND place.name IS NOT NULL
              AND coalesce(place.tour_latitude, place.latitude) IS NOT NULL
              AND coalesce(place.tour_longitude, place.longitude) IS NOT NULL
            RETURN elementId(place) AS key,
                   coalesce(place.place_id, place.spot_id, place.building_id, elementId(place)) AS id,
                   labels(place) AS labels, place.name AS name,
                   coalesce(place.description, place.main_function, place.related_content, '') AS description,
                   coalesce(place.tour_latitude, place.latitude) AS latitude,
                   coalesce(place.tour_longitude, place.longitude) AS longitude
            """
        )]
        facilities = [dict(row) for row in session.run(
            """
            MATCH (facility:Facility)-[:LOCATED_IN]->(place)
            RETURN DISTINCT elementId(place) AS placeKey,
                   coalesce(facility.facility_id, facility.store_id, facility.room_id, elementId(facility)) AS id,
                   facility.name AS name, coalesce(facility.type, '') AS type,
                   coalesce(facility.floor, facility.location, '') AS floor,
                   coalesce(facility.features, '') AS features,
                   coalesce(facility.note, '') AS note,
                   coalesce(facility.hours, '') AS hours,
                   coalesce(facility.restriction, '') AS restriction
            UNION
            MATCH (place)-[:HAS_STORE]->(facility:Facility)
            RETURN DISTINCT elementId(place) AS placeKey,
                   coalesce(facility.facility_id, facility.store_id, facility.room_id, elementId(facility)) AS id,
                   facility.name AS name, coalesce(facility.type, '') AS type,
                   coalesce(facility.floor, facility.location, '') AS floor,
                   coalesce(facility.features, '') AS features,
                   coalesce(facility.note, '') AS note,
                   coalesce(facility.hours, '') AS hours,
                   coalesce(facility.restriction, '') AS restriction
            UNION
            MATCH (place)-[:HAS_FLOOR]->(:Floor)-[:HAS_FACILITY|HAS_ROOM]->(facility:Facility)
            RETURN DISTINCT elementId(place) AS placeKey,
                   coalesce(facility.facility_id, facility.store_id, facility.room_id, elementId(facility)) AS id,
                   facility.name AS name, coalesce(facility.type, '') AS type,
                   coalesce(facility.floor, facility.location, '') AS floor,
                   coalesce(facility.features, '') AS features,
                   coalesce(facility.note, '') AS note,
                   coalesce(facility.hours, '') AS hours,
                   coalesce(facility.restriction, '') AS restriction
            """
        )]
        facts = [dict(row) for row in session.run(
            """
            MATCH (place)-[:HAS_FACT]->(fact:Fact)
            WHERE place:Building OR place:Place
            RETURN elementId(place) AS placeKey, fact.fact_id AS id,
                   fact.category AS category, fact.content AS content,
                   fact.importance AS importance, fact.verified AS verified
            ORDER BY fact.importance DESC
            """
        )]

    by_key = {place["key"]: {**place, "facilities": [], "facts": []} for place in places}
    for facility in facilities:
        if facility["placeKey"] in by_key:
            facility["purposes"] = _facility_purposes(facility)
            by_key[facility["placeKey"]]["facilities"].append(facility)
    for fact in facts:
        if fact["placeKey"] in by_key:
            fact["purposes"] = _purposes_for_text(fact["category"], fact["content"])
            by_key[fact["placeKey"]]["facts"].append(fact)

    normalized_query = query.strip().lower()
    results = []
    for place in by_key.values():
        place_purposes = set(_purposes_for_text(place["name"], place["description"]))
        matched_facilities = [
            facility for facility in place["facilities"]
            if purpose is None or purpose in facility["purposes"]
        ]
        matched_facts = [
            fact for fact in place["facts"]
            if purpose is None or purpose in fact["purposes"]
        ]
        place_purposes.update(
            item for facility in place["facilities"] for item in facility["purposes"]
        )
        place_purposes.update(item for fact in place["facts"] for item in fact["purposes"])
        if purpose and purpose not in place_purposes:
            continue
        if purpose in {"convenience_store", "cafe"} and not matched_facilities:
            continue

        searchable = " ".join([
            place["name"], place["description"],
            *(
                " ".join(str(value or "") for value in facility.values())
                for facility in place["facilities"]
            ),
            *(fact.get("content", "") for fact in place["facts"]),
        ]).lower()
        if normalized_query and normalized_query not in searchable:
            continue

        best_facility = next((item for item in matched_facilities if _facility_summary(item)), None)
        best_fact = next(
            (item for item in matched_facts if item.get("verified") is not False),
            matched_facts[0] if matched_facts else None,
        )
        summary = (
            _facility_summary(best_facility) if best_facility
            else (best_fact or {}).get("content")
            or place["description"]
            or f"{place['name']} 위치 안내"
        )
        results.append({
            "id": place["id"],
            "name": place["name"],
            "description": summary,
            "category": _category(place["labels"], place["name"], summary),
            "labels": place["labels"],
            "coordinate": {"lat": place["latitude"], "lng": place["longitude"]},
            "purposes": sorted(place_purposes),
            "matchedPurpose": purpose,
            "facilities": matched_facilities[:6],
            "facts": matched_facts[:4],
        })
    return results[:limit]


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
    results = _guide_discovery(request.app.state.neo4j_driver, query=q, limit=limit)
    return {"query": q, "total": len(results), "results": results}


@router.get("/discover")
def discover(
    request: Request,
    purpose: Literal["study", "rest", "convenience", "convenience_store", "cafe", "food", "parking"],
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=30, ge=1, le=50),
):
    results = _guide_discovery(
        request.app.state.neo4j_driver,
        purpose=purpose,
        query=q,
        limit=limit,
    )
    return {"purpose": purpose, "query": q, "total": len(results), "results": results}


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
        "guides": local_guides(path),
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
