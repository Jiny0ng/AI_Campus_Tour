from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
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
from utils.routing import get_shortest_path, haversine

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
    latitude: float
    longitude: float


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

def get_tour_stops() -> List[Dict[str, Any]]:
    csv_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "campusdata", "tour_route.csv"
    )
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=500, detail="투어 경로 CSV가 없습니다.")

    stops = []
    with open(csv_path, "r", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            try:
                stops.append({
                    "order": int(row["order"]),
                    "place_id": row["place_id"].strip(),
                    "name": row["name"].strip(),
                    "latitude": float(row["latitude"]),
                    "longitude": float(row["longitude"]),
                })
            except (KeyError, TypeError, ValueError) as error:
                raise HTTPException(
                    status_code=500,
                    detail=f"투어 경로 CSV 형식이 올바르지 않습니다: {error}",
                ) from error
    return sorted(stops, key=lambda stop: stop["order"])


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

def get_nearby_docent_spots(lat: Optional[float], lng: Optional[float], radius_meters: float = 100.0):
    if lat is None or lng is None:
        return []

    csv_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "campusdata", "nodes_docent_spot.csv"
    )
    if not os.path.exists(csv_path):
        return []

    spots = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                spot_lat = float(row["latitude"])
                spot_lng = float(row["longitude"])
            except (KeyError, TypeError, ValueError):
                continue

            distance = haversine(lat, lng, spot_lat, spot_lng)
            if distance <= radius_meters:
                spots.append({
                    "id": row.get("spot_id", ""),
                    "name": row.get("name", ""),
                    "category": row.get("spot_type", "도슨트스팟"),
                    "description": row.get("description", ""),
                    "docentText": row.get("docent_text", ""),
                    "latitude": spot_lat,
                    "longitude": spot_lng,
                    "distanceMeters": round(distance),
                })

    return sorted(spots, key=lambda spot: spot["distanceMeters"])

def get_building_coords(driver, name: str):
    with driver.session() as session:
        node = session.run("MATCH (b) WHERE (b:Building OR b:TourStop) AND b.name = $name RETURN b.latitude AS lat, b.longitude AS lng", {"name": name}).single()
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
async def nearby_docent_spots(req: NearbySpotsRequest):
    return {
        "status": "success",
        "nearbySpots": get_nearby_docent_spots(req.latitude, req.longitude),
    }


@lru_cache(maxsize=1)
def build_tour_data() -> Dict[str, Any]:
    """Build the fixed route once and reuse it for every tour start."""
    route_stops = get_tour_stops()
    if len(route_stops) < 2:
        raise HTTPException(status_code=500, detail="투어 경로에는 두 개 이상의 경유지가 필요합니다.")

    stops_data = []
    for i, route_stop in enumerate(route_stops):
        name = route_stop["name"]
        stops_data.append({
            "id": route_stop["place_id"],
            "name": name,
            "description": f"{name}입니다.",
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

    return {
        "courseTitle": "JBNU Campus Tour",
        "stops": stops_data,
        "routeSegments": route_segments,
    }


def warm_tour_cache() -> None:
    build_tour_data()


@router.post("/init")
async def init_tour(req: TourRequest):
    """Return the single precomputed campus tour route."""
    return {
        "status": "success",
        "message": "단일 캠퍼스 투어 경로 생성 완료",
        "data": build_tour_data(),
    }

@router.post("/segment")
def get_tour_segment(req: SegmentRequest, request: Request):
    """
    현재 경유지에서 다음 경유지까지의 구간 정보와 주변 POI, Graph RAG 꿀팁을 반환합니다.
    오차 +- 10m 고려하여 대략 50m 반경을 위경도 차이(~0.00045도)로 단순 계산합니다.
    """
    driver = request.app.state.neo4j_driver
    nearby_spots = get_nearby_docent_spots(req.current_lat, req.current_lng)

    # 1. 위치의 위경도 정보 확인 (요청에 없으면 DB에서 조회)
    cur_lat, cur_lng = req.current_lat, req.current_lng
    nxt_lat, nxt_lng = req.next_lat, req.next_lng

    with driver.session() as session:
        if cur_lat is None or cur_lng is None:
            cur_node = session.run("MATCH (b:Building {name: $name}) RETURN b.latitude AS lat, b.longitude AS lng", {"name": req.current_location}).single()
            if cur_node and cur_node["lat"]:
                cur_lat, cur_lng = cur_node["lat"], cur_node["lng"]

        if nxt_lat is None or nxt_lng is None:
            nxt_node = session.run("MATCH (b:Building {name: $name}) RETURN b.latitude AS lat, b.longitude AS lng", {"name": req.next_location}).single()
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
            "nearbySpots": nearby_spots,
        }

    # 2. 바운딩 박스 계산 (50m 반경 확장)
    delta_deg = 0.00045 # 약 50m
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
        "nearbySpots": nearby_spots,
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
