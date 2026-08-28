from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import yaml
import os
import csv
import json
import re
from functools import lru_cache
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from utils.routing import get_shortest_path
from services.docent_content import build_stop_presentation, get_docent_context

router = APIRouter(prefix="/tour", tags=["캠퍼스 투어"])
TOUR_TIPS_MODEL = os.getenv("TOUR_TIPS_MODEL", "gemini-3.5-flash-lite")

class TourRequest(BaseModel):
    language: Literal["ko", "en", "ja", "zh"] = "ko"

class FeedbackRequest(BaseModel):
    current_location: str
    current_tour_waypoints: List[str]
    user_feedback: str

class SegmentRequest(BaseModel):
    current_location: str
    next_location: str
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    next_lat: Optional[float] = None
    next_lng: Optional[float] = None
    language: Literal["ko", "en", "ja", "zh"] = "ko"

class WaypointRouteRequest(BaseModel):
    current_lat: float
    current_lng: float
    spot_id: str
    spot_name: str
    spot_lat: float
    spot_lng: float
    next_stop_id: str
    next_lat: float
    next_lng: float
    language: Literal["ko", "en", "ja", "zh"] = "ko"

class StartRouteRequest(BaseModel):
    current_lat: float
    current_lng: float
    first_stop_id: str
    first_stop_lat: float
    first_stop_lng: float

class NearbySpotsRequest(BaseModel):
    destination_id: str
    latitude: float
    longitude: float


class NearbyDocentSpotsRequest(BaseModel):
    latitude: float
    longitude: float
    radius_meters: float = Field(default=60, ge=10, le=100)
    language: Literal["ko", "en", "ja", "zh"] = "ko"


# 퓨샷 프롬프트 로드 유틸리티
def load_prompt(filename: str):
    path = os.path.join(os.path.dirname(__file__), "..", "prompts", filename)
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

# LLM 초기화 (환경변수에 GOOGLE_API_KEY 필요)
def get_llm():
    return ChatGoogleGenerativeAI(
        model=TOUR_TIPS_MODEL,
        max_output_tokens=1024,
    )

def get_tour_stops(driver) -> List[Dict[str, Any]]:
    """Read the route and its role-specific coordinates from Neo4j."""
    with driver.session() as session:
        rows = session.run(
            """
            MATCH (stop:TourStop)
            WHERE stop.place_id IS NOT NULL AND stop.order IS NOT NULL
            RETURN stop.order AS order, stop.place_id AS place_id,
                   stop.name AS name,
                   coalesce(stop.tour_latitude, stop.latitude) AS latitude,
                   coalesce(stop.tour_longitude, stop.longitude) AS longitude
            ORDER BY order
            """
        )
        stops = [dict(row) for row in rows]
    if len(stops) < 2 or any(
        stop["latitude"] is None or stop["longitude"] is None for stop in stops
    ):
        raise HTTPException(status_code=500, detail="Neo4j 투어 좌표 데이터가 올바르지 않습니다.")
    return stops


LANGUAGE_NAMES = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Simplified Chinese",
}

FALLBACK_TIPS = {
    "ko": "해당 구간의 팁을 불러오지 못했습니다.",
    "en": "Tips for this section could not be loaded.",
    "ja": "この区間のヒントを読み込めませんでした。",
    "zh": "无法加载此路段的提示。",
}


@lru_cache(maxsize=128)
def generate_segment_tips(
    current_location: str,
    next_location: str,
    language: str,
    pois_json: str,
) -> List[Dict[str, Any]]:
    """Generate a segment summary once per route/language/POI combination."""
    try:
        rag_prompt_data = load_prompt("graph_rag_poi.yaml")
        output_language = LANGUAGE_NAMES[language]
        prompt_str = (
            f"{rag_prompt_data['system_prompt']}\n\n"
            f"현재 구간: {current_location} -> {next_location}\n"
            f"주변 POI 리스트: {pois_json}\n\n"
            f"Write every user-visible JSON value in {output_language}. "
            "Keep Korean proper place names unchanged when translation would make navigation ambiguous. "
            "Return JSON only."
        )
        response = get_llm().invoke(prompt_str)
        match = re.search(r"\[.*\]", str(response.content), re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
    except Exception as error:
        print(f"LLM Error ({TOUR_TIPS_MODEL}):", error)

    return [{
        "name": "Info",
        "icon": "💡",
        "category": "Info",
        "tip": FALLBACK_TIPS[language],
    }]

def get_nearby_places(
    driver,
    destination_id: str,
    lat: Optional[float],
    lng: Optional[float],
):
    if lat is None or lng is None or not destination_id:
        return []

    with driver.session() as session:
        rows = session.run(
            """
            MATCH (destination)
            WHERE destination.place_id = $destination_id
               OR destination.spot_id = $destination_id
               OR destination.building_id = $destination_id
            MATCH (destination)-[near:NEAR|SEMI_NEAR]-(place)
            WHERE near.kind = 'physical_walk'
              AND (place:Building OR place:Place OR place:Facility OR place:DocentSpot)
              AND place <> destination
              AND place.name IS NOT NULL
              AND place.latitude IS NOT NULL
              AND place.longitude IS NOT NULL
              AND NOT place:Parking
              AND NOT toLower(coalesce(place.type, '')) CONTAINS '주차'
              AND NOT toLower(coalesce(place.category, '')) CONTAINS '주차'
              AND NOT toLower(coalesce(place.spot_type, '')) CONTAINS '버스 승강장'
              AND NOT toLower(coalesce(place.spot_type, '')) CONTAINS '버스승강장'
              AND NOT toLower(place.name) CONTAINS '승강장'
            OPTIONAL MATCH (place)-[:HAS_FACT]->(fact:Fact)
            WITH place, near, fact
            ORDER BY fact.importance DESC
            WITH place, near, collect(fact)[0] AS first_fact
            WITH place, near, first_fact,
                 coalesce(
                    place.description,
                    place.main_function,
                    place.related_content,
                    first_fact.content,
                    ''
                 ) AS summary
            WHERE trim(summary) <> ''
            RETURN coalesce(
                       place.place_id, place.spot_id, place.building_id,
                       place.facility_id, place.store_id, elementId(place)
                   ) AS id,
                   place.name AS name,
                   coalesce(place.spot_type, place.category, place.type, '장소') AS category,
                   summary AS description,
                   coalesce(place.docent_text, '') AS docentText,
                   place.latitude AS latitude,
                   place.longitude AS longitude,
                   near.distance_m AS distanceMeters,
                   near.walking_seconds AS walkingSeconds,
                   near.method AS nearMethod,
                   near.verified AS nearVerified
                   ,type(near) AS proximityTier
            ORDER BY CASE WHEN type(near) = 'NEAR' THEN 0 ELSE 1 END,
                     CASE
                       WHEN place:DocentSpot THEN 0
                       WHEN place:Building THEN 2
                       WHEN place:Place THEN 1
                       ELSE 3
                     END,
                     near.walking_seconds, near.distance_m, name
            LIMIT 12
            """,
            destination_id=destination_id,
            latitude=lat,
            longitude=lng,
        )
        return [dict(row) for row in rows]


def get_gps_nearby_docent_spots(
    driver,
    latitude: float,
    longitude: float,
    radius_meters: float = 60,
    language: str = "ko",
):
    """Return docent spots inside the user's current GPS radius."""
    with driver.session() as session:
        rows = session.run(
            """
            MATCH (spot:DocentSpot)
            WHERE spot.latitude IS NOT NULL AND spot.longitude IS NOT NULL
            WITH spot, point.distance(
                point({latitude: toFloat(spot.latitude), longitude: toFloat(spot.longitude)}),
                point({latitude: $latitude, longitude: $longitude})
            ) AS distance_m
            WHERE distance_m <= $radius_meters
            RETURN coalesce(spot.spot_id, spot.place_id, elementId(spot)) AS id,
                   spot.name AS name,
                   coalesce(spot.spot_type, spot.category, '도슨트스팟') AS category,
                   coalesce(spot.description, spot.related_content, '') AS description,
                   coalesce(spot.docent_text, '') AS docentText,
                   toFloat(spot.latitude) AS latitude,
                   toFloat(spot.longitude) AS longitude,
                   round(distance_m, 1) AS distanceMeters,
                   toInteger(ceil(distance_m / 1.3)) AS walkingSeconds,
                   'gps_radius' AS nearMethod,
                   true AS nearVerified
            ORDER BY distance_m, name
            LIMIT 5
            """,
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
        )
        spots = [dict(row) for row in rows]
    generated = active_generated_docents()
    results = []
    for spot in spots:
        entity_id = str(spot.get("id", ""))
        asset_prefix = "en-route-docent" if entity_id in generated else "core-docent"
        spot["audioAssetId"] = f"{asset_prefix}:{entity_id}:{language}"
        results.append(spot)
    return results

def get_building_coords(driver, name: str):
    with driver.session() as session:
        node = session.run("MATCH (b) WHERE (b:Building OR b:TourStop) AND b.name = $name RETURN coalesce(b.tour_latitude, b.latitude) AS lat, coalesce(b.tour_longitude, b.longitude) AS lng", {"name": name}).single()
        if not node or not node["lat"]:
            node = session.run("MATCH (b:Building) WHERE b.name CONTAINS $name RETURN b.latitude AS lat, b.longitude AS lng LIMIT 1", {"name": name}).single()
        if node and node["lat"]:
            return {"x": node["lng"], "y": node["lat"]}
    return None

def get_all_landmarks(driver):
    landmarks = []
    with driver.session() as session:
        rows = session.run("MATCH (b:Building) WHERE b.latitude IS NOT NULL RETURN b.name AS name LIMIT 50")
        for r in rows:
            landmarks.append(r["name"])
    return landmarks

@router.post("/nearby-spots")
async def nearby_docent_spots(req: NearbySpotsRequest, request: Request):
    return {
        "status": "success",
        "maxWalkingSeconds": 60,
        "nearbySpots": get_nearby_places(
            request.app.state.neo4j_driver,
            req.destination_id,
            req.latitude,
            req.longitude,
        ),
    }


@router.post("/nearby-docent-spots")
async def nearby_docent_spots_by_gps(req: NearbyDocentSpotsRequest, request: Request):
    spots = get_gps_nearby_docent_spots(
        request.app.state.neo4j_driver,
        req.latitude,
        req.longitude,
        req.radius_meters,
        language=req.language,
    )
    return {
        "status": "success",
        "triggerRadiusMeters": req.radius_meters,
        "nearbySpots": spots,
    }


_tour_data_cache: Dict[str, Dict[str, Any]] = {}


@lru_cache(maxsize=1)
def active_generated_docents() -> Dict[str, Dict[str, Any]]:
    default_manifest_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "campusdata", "audio_content",
        "audio_manifest.json",
    )
    manifest_path = os.getenv("TTS_MANIFEST_PATH", default_manifest_path)
    path = os.path.join(os.path.dirname(manifest_path), "generated_docents.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as file:
            scripts = json.load(file).get("scripts", {})
        return {
            entity_id: entry
            for entity_id, entry in scripts.items()
            if isinstance(entry, dict)
            and entry.get("status") == "active"
            and isinstance(entry.get("enRouteText", entry.get("text")), str)
        }
    except (OSError, ValueError, AttributeError):
        return {}


@lru_cache(maxsize=1)
def tour_stop_docent_texts() -> Dict[str, str]:
    csv_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "campusdata", "campus_places.csv"
    )
    if not os.path.exists(csv_path):
        return {}
    with open(csv_path, "r", encoding="utf-8-sig") as file:
        reviewed = {
            row.get("id", ""): row.get("docent_text", "").strip()
            for row in csv.DictReader(file)
            if row.get("entity_type") == "tour_stop" and row.get("docent_text", "").strip()
        }
    reviewed.update({
        entity_id: str(entry.get("enRouteText", entry.get("text", ""))).strip()
        for entity_id, entry in active_generated_docents().items()
    })
    return reviewed


def build_tour_data(driver, language: str = "ko", refresh: bool = False) -> Dict[str, Any]:
    """Build the fixed route once per language and reuse it for every tour start."""
    global _tour_data_cache
    if language in _tour_data_cache and not refresh:
        return _tour_data_cache[language]
    route_stops = get_tour_stops(driver)
    if len(route_stops) < 2:
        raise HTTPException(status_code=500, detail="투어 경로에는 두 개 이상의 경유지가 필요합니다.")

    stops_data = []
    reviewed_docents = tour_stop_docent_texts()
    generated_docents = active_generated_docents()
    for i, route_stop in enumerate(route_stops):
        name = route_stop["name"]
        docent_context = get_docent_context(driver, route_stop["place_id"])
        generated_entry = generated_docents.get(route_stop["place_id"], {})

        # Extract language-specific docent text from translations dict
        translations = generated_entry.get("translations", {})
        lang_data = translations.get(language, {})
        if lang_data:
            docent_text = lang_data.get("enRouteText", "")
            arrival_text = lang_data.get("arrivalText", "")
        else:
            # Fall back to top-level fields (always Korean)
            docent_text = reviewed_docents.get(route_stop["place_id"], "")
            arrival_text = str(generated_entry.get("arrivalText", ""))

        overview, insights = build_stop_presentation(
            docent_context,
            f"{name}입니다.",
            docent_text,
        )
        stops_data.append({
            "id": route_stop["place_id"],
            "name": name,
            "description": overview,
            "overview": overview,
            "insights": insights,
            "docentText": docent_text,
            "enRouteDocentText": docent_text,
            "arrivalDocentText": arrival_text,
            "arrivalDocentEnabled": bool(generated_entry.get("arrivalEnabled", False)),
            "docentContext": docent_context,
            "tags": [],
            "studentTip": [],
            "nextStopId": route_stops[i + 1]["place_id"] if i < len(route_stops) - 1 else None,
            "mapPoint": {
                "x": route_stop["longitude"],
                "y": route_stop["latitude"],
            },
        })

    route_segments = []

    visited_edges = set()

    for i in range(len(stops_data) - 1):
        curr = stops_data[i]
        nxt = stops_data[i+1]

        # Use NetworkX routing directly to get the shortest real-world path
        path_segment = get_shortest_path(curr["mapPoint"], nxt["mapPoint"], visited_edges=visited_edges)

        # Add used edges to visited_edges so we avoid returning on the exact same path
        for k in range(len(path_segment) - 1):
            p1 = (path_segment[k]["x"], path_segment[k]["y"])
            p2 = (path_segment[k+1]["x"], path_segment[k+1]["y"])
            visited_edges.add(frozenset([p1, p2]))

        route_segments.append({
            "fromStopId": curr["id"],
            "toStopId": nxt["id"],
            "points": path_segment
        })

    result = {
        "courseTitle": "JBNU Campus Tour",
        "stops": stops_data,
        "routeSegments": route_segments,
    }
    _tour_data_cache[language] = result
    return result


def warm_tour_cache(driver) -> None:
    build_tour_data(driver, language="ko", refresh=True)


@router.post("/init")
async def init_tour(req: TourRequest, request: Request):
    """Return the single precomputed campus tour route."""
    return {
        "status": "success",
        "message": "단일 캠퍼스 투어 경로 생성 완료",
        "data": build_tour_data(request.app.state.neo4j_driver, language=req.language),
    }

@router.post("/segment")
def get_tour_segment(req: SegmentRequest, request: Request):
    """
    현재 경유지에서 다음 경유지까지의 구간 정보와 주변 POI, Graph RAG 꿀팁을 반환합니다.
    오차 +- 10m 고려하여 대략 50m 반경을 위경도 차이(~0.00045도)로 단순 계산합니다.
    """
    driver = request.app.state.neo4j_driver
    # 1. 위치의 위경도 정보 확인 (요청에 없으면 DB에서 조회)
    cur_lat, cur_lng = req.current_lat, req.current_lng
    nxt_lat, nxt_lng = req.next_lat, req.next_lng

    with driver.session() as session:
        if cur_lat is None or cur_lng is None:
            cur_node = session.run("MATCH (b) WHERE (b:Building OR b:TourStop) AND b.name = $name RETURN coalesce(b.tour_latitude, b.latitude) AS lat, coalesce(b.tour_longitude, b.longitude) AS lng", {"name": req.current_location}).single()
            if cur_node and cur_node["lat"]:
                cur_lat, cur_lng = cur_node["lat"], cur_node["lng"]

        if nxt_lat is None or nxt_lng is None:
            nxt_node = session.run("MATCH (b) WHERE (b:Building OR b:TourStop) AND b.name = $name RETURN coalesce(b.tour_latitude, b.latitude) AS lat, coalesce(b.tour_longitude, b.longitude) AS lng", {"name": req.next_location}).single()
            if nxt_node and nxt_node["lat"]:
                nxt_lat, nxt_lng = nxt_node["lat"], nxt_node["lng"]

    # 위경도 정보를 알 수 없는 경우 기본 팁 반환
    if cur_lat is None or nxt_lat is None:
        return {
            "status": "success",
            "current_location": req.current_location,
            "next_location": req.next_location,
            "pois": [],
            "tips": [],
            "nearbySpots": [],
        }

    # 2. 바운딩 박스 계산 (50m 반경 확장)
    delta_deg = 0.00045 # 약 50m

    # [Fix] 거리가 너무 멀면(약 2km 이상 차이) 캠퍼스 전체가 바운딩 박스에 잡혀 LLM이 마비됨
    # 서울에서 켰을 때 발생하는 버그 방지용 (빈 팁 반환)
    if abs(cur_lat - nxt_lat) > 0.02 or abs(cur_lng - nxt_lng) > 0.02:
        return {
            "status": "success",
            "current_location": req.current_location,
            "next_location": req.next_location,
            "pois": [],
            "tips": [],
            "nearbySpots": [],
        }

    min_lat = min(cur_lat, nxt_lat) - delta_deg
    max_lat = max(cur_lat, nxt_lat) + delta_deg
    min_lng = min(cur_lng, nxt_lng) - delta_deg
    max_lng = max(cur_lng, nxt_lng) + delta_deg

    # 3. 바운딩 박스 내의 건물, 편의시설 조회
    pois = []
    with driver.session() as session:
        # 해당 바운딩 박스 내 건물 검색
        b_rows = session.run("""
            MATCH (b:Building)
            WHERE b.latitude >= $min_lat AND b.latitude <= $max_lat
              AND b.longitude >= $min_lng AND b.longitude <= $max_lng
            RETURN b.name AS name, '건물' AS category, b.latitude AS lat, b.longitude AS lng
        """, {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng})

        found_buildings = []
        for r in b_rows:
            pois.append({"name": r["name"], "category": r["category"]})
            found_buildings.append(r["name"])

        # 검색된 건물 내부의 매장/시설 검색
        if found_buildings:
            s_rows = session.run("""
                MATCH (b:Building)-[:HAS_STORE]->(s:Store)
                WHERE b.name IN $buildings
                RETURN s.name AS name, s.type AS category
            """, {"buildings": found_buildings})
            for r in s_rows:
                pois.append({"name": r["name"], "category": r["category"]})

            f_rows = session.run("""
                MATCH (b:Building)<-[:LOCATED_IN]-(f:Facility)
                WHERE b.name IN $buildings
                RETURN f.name AS name, f.type AS category
            """, {"buildings": found_buildings})
            for r in f_rows:
                pois.append({"name": r["name"], "category": r["category"]})

    # 4. Graph RAG (LLM 호출, 동일 구간/언어 결과 캐시)
    tips = generate_segment_tips(
        req.current_location,
        req.next_location,
        req.language,
        json.dumps(pois, ensure_ascii=False, sort_keys=True),
    )

    return {
        "status": "success",
        "current_location": req.current_location,
        "next_location": req.next_location,
        "pois": pois,
        "tips": tips,
        "nearbySpots": [],
    }

@router.post("/waypoint-route")
async def get_waypoint_route(req: WaypointRouteRequest):
    current_coord = {"x": req.current_lng, "y": req.current_lat}
    spot_coord = {"x": req.spot_lng, "y": req.spot_lat}
    next_coord = {"x": req.next_lng, "y": req.next_lat}

    return {
        "status": "success",
        "stop": {
            "id": req.spot_id,
            "name": req.spot_name,
            "description": {
                "ko": "추천 도슨트 스팟입니다.",
                "en": "A recommended docent spot.",
                "ja": "おすすめのドーセントスポットです。",
                "zh": "推荐的导览景点。",
            }[req.language],
            "tags": [],
            "studentTip": [],
            "nextStopId": req.next_stop_id,
            "mapPoint": spot_coord,
        },
        "segments": [
            {
                "fromStopId": "current",
                "toStopId": req.spot_id,
                "points": get_shortest_path(current_coord, spot_coord),
            },
            {
                "fromStopId": req.spot_id,
                "toStopId": req.next_stop_id,
                "points": get_shortest_path(spot_coord, next_coord),
            },
        ],
    }

@router.post("/start-route")
async def get_start_route(req: StartRouteRequest):
    current_coord = {"x": req.current_lng, "y": req.current_lat}
    first_stop_coord = {"x": req.first_stop_lng, "y": req.first_stop_lat}

    return {
        "status": "success",
        "segment": {
            "fromStopId": "current_location",
            "toStopId": req.first_stop_id,
            "points": get_shortest_path(current_coord, first_stop_coord),
        },
    }
