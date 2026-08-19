from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import yaml
import os
import csv
import json
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
from utils.routing import get_shortest_path, haversine

router = APIRouter(prefix="/tour", tags=["캠퍼스 투어"])

class TourRequest(BaseModel):
    start_location: str
    theme: Optional[str] = "일반 투어"
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None

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
    return ChatGoogleGenerativeAI(model="gemini-3.6-flash", temperature=0.7)

# Helper: load csv
def get_theme_stops(theme: str) -> List[str]:
    csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "campusdata", "tour_routes.csv")
    stops = []
    if os.path.exists(csv_path):
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("course") == theme:
                    for i in range(1, 19):
                        val = row.get(f"stop{i}")
                        if val and val.strip():
                            stops.append(val.strip())
                    break
    return stops

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
        node = session.run("MATCH (b:Building) WHERE b.name = $name RETURN b.latitude AS lat, b.longitude AS lng", {"name": name}).single()
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


@router.post("/init")
async def init_tour(req: TourRequest, request: Request):
    """
    투어 시작 API
    """
    driver = request.app.state.neo4j_driver

    theme_stops = get_theme_stops(req.theme)
    if not theme_stops:
        theme_stops = [req.start_location, "진수당", "도서관", "건지광장"]

    # GPS가 제공되면 '현위치'를 시작점으로 추가
    if hasattr(req, 'current_lat') and req.current_lat and req.current_lng:
        if theme_stops[0] != "현위치":
            theme_stops.insert(0, "현위치")

    stops_data = []
    for i, name in enumerate(theme_stops):
        if name == "현위치" and hasattr(req, 'current_lat') and req.current_lat:
            coord = {"x": req.current_lng, "y": req.current_lat}
        else:
            coord = get_building_coords(driver, name)

        if not coord:
            coord = {"x": 127.1294, "y": 35.8468} # default

        stops_data.append({
            "id": f"stop_{i}",
            "name": name,
            "description": f"{name}입니다." if name != "현위치" else "투어를 시작하는 현재 위치입니다.",
            "tags": [],
            "studentTip": [],
            "nextStopId": f"stop_{i+1}" if i < len(theme_stops) - 1 else None,
            "mapPoint": coord
        })

    all_landmarks = get_all_landmarks(driver)

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
        "status": "success",
        "message": f"'{req.start_location}'에서 시작하는 '{req.theme}' 경로 생성 완료",
        "data": {
            "courseTitle": req.theme,
            "stops": stops_data,
            "routeSegments": route_segments
        }
    }

@router.post("/segment")
async def get_tour_segment(req: SegmentRequest, request: Request):
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

    # 4. Graph RAG (LLM 호출)
    try:
        rag_prompt_data = load_prompt("graph_rag_poi.yaml")
        system_msg = rag_prompt_data["system_prompt"]

        llm = get_llm()
        prompt_str = f"{system_msg}\n\n현재 구간: {req.current_location} -> {req.next_location}\n주변 POI 리스트: {pois}\n\n위 지침에 따라 JSON으로 답변해."

        response = llm.invoke(prompt_str)
        # JSON 형식 응답 텍스트 추출 (마크다운 코드블럭 제거)
        raw_text = response.content
        import json, re
        match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if match:
            tips = json.loads(match.group(0))
        else:
            tips = [{"name": "안내", "icon": "💡", "category": "안내", "tip": "주변에 다양한 시설이 있습니다."}]
    except Exception as e:
        print("LLM Error:", e)
        tips = [{"name": "안내", "icon": "💡", "category": "안내", "tip": "해당 구간의 팁을 불러오지 못했습니다."}]

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
            "description": "추천 도슨트 스팟입니다.",
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
