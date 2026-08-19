import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Query
from neo4j import GraphDatabase

from fastapi.middleware.cors import CORSMiddleware
from routers import directions, tour
from utils.routing import load_graph

# ───────────────────────────────────────────────
# 환경변수에서 Neo4j 접속 정보 로드
# ───────────────────────────────────────────────
NEO4J_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER     = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.neo4j_driver = GraphDatabase.driver(
        NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
    )
    print("✅ Neo4j 연결 성공")
    load_graph()
    yield
    app.state.neo4j_driver.close()
    print("🔌 Neo4j 연결 종료")


app = FastAPI(
    title="캠퍼스 적응형 AI API",
    description="Neo4j 지식 그래프 기반 캠퍼스 안내 서비스",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS 미들웨어 추가 (GCP 배포 시 프론트엔드 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 보안 강화를 위해 실제 프론트엔드 도메인으로 변경 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
from routers import review
app.include_router(tour.router)
app.include_router(review.router)
app.include_router(directions.router)

def query_neo4j(query: str, params: dict = None):
    driver = app.state.neo4j_driver
    with driver.session() as session:
        result = session.run(query, **(params or {}))
        return [record.data() for record in result]


# ═══════════════════════════════════════════════
# 상태 확인
# ═══════════════════════════════════════════════

@app.get("/", tags=["상태 확인"])
def root():
    """서버 정상 동작 확인용 헬스체크"""
    return {"status": "ok", "message": "캠퍼스 AI 서버가 정상적으로 실행 중입니다! 🎓", "version": "0.2.0"}


@app.get("/health/db", tags=["상태 확인"])
def check_db():
    """Neo4j DB 연결 상태 및 전체 노드 현황"""
    try:
        app.state.neo4j_driver.verify_connectivity()
        rows = query_neo4j("""
            MATCH (b:Building)       WITH count(b) AS bc
            MATCH (f:Floor)          WITH bc, count(f) AS fc
            MATCH (r:Room)           WITH bc, fc, count(r) AS rc
            MATCH (s:Store)          WITH bc, fc, rc, count(s) AS sc
            MATCH (d:Department)     WITH bc, fc, rc, sc, count(d) AS dc
            MATCH (t:Transportation) WITH bc, fc, rc, sc, dc, count(t) AS tc
            MATCH (fac:Facility)     WITH bc, fc, rc, sc, dc, tc, count(fac) AS facc
            RETURN bc, fc, rc, sc, dc, tc, facc
        """)
        c = rows[0]
        return {
            "status": "ok",
            "message": "Neo4j 연결 정상 🕸️",
            "node_counts": {
                "buildings":      c["bc"],
                "floors":         c["fc"],
                "rooms":          c["rc"],
                "stores":         c["sc"],
                "departments":    c["dc"],
                "transportation": c["tc"],
                "facilities":     c["facc"],
            }
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ═══════════════════════════════════════════════
# 건물 정보
# ═══════════════════════════════════════════════

@app.get("/campus/buildings", tags=["건물"])
def get_buildings(
    zone: Optional[str] = Query(default=None, description="캠퍼스 구역 필터 (예: 전주캠퍼스)")
):
    """전체 건물 목록 조회 (신규 마스터 데이터 기준)"""
    if zone:
        rows = query_neo4j("""
            MATCH (b:Building) WHERE b.zone = $zone AND b.building_id IS NOT NULL
            RETURN b.building_id AS id, b.name AS name, b.alias AS alias,
                   b.zone AS zone, b.map_num AS map_num, b.address AS address,
                   b.phone AS phone, b.is_24h AS is_24h, b.operating_hrs AS operating_hrs,
                   b.latitude AS lat, b.longitude AS lng
            ORDER BY b.map_num
        """, {"zone": zone})
    else:
        rows = query_neo4j("""
            MATCH (b:Building) WHERE b.building_id IS NOT NULL
            RETURN b.building_id AS id, b.name AS name, b.alias AS alias,
                   b.zone AS zone, b.map_num AS map_num, b.address AS address,
                   b.phone AS phone, b.is_24h AS is_24h, b.operating_hrs AS operating_hrs,
                   b.latitude AS lat, b.longitude AS lng
            ORDER BY b.map_num
        """)
    return {"total": len(rows), "buildings": rows}


@app.get("/campus/buildings/{building_name}/floors", tags=["건물"])
def get_floors(building_name: str):
    """특정 건물의 층 목록 조회"""
    rows = query_neo4j("""
        MATCH (b:Building {name: $name})-[:HAS_FLOOR]->(f:Floor)
        RETURN f.floor AS floor
        ORDER BY f.floor
    """, {"name": building_name})
    return {"building": building_name, "floors": [r["floor"] for r in rows]}


@app.get("/campus/buildings/{building_name}/rooms", tags=["건물"])
def get_rooms(
    building_name: str,
    floor: Optional[str] = Query(default=None, description="층 필터 (예: 1층)")
):
    """특정 건물(+선택 층)의 호실 목록 조회"""
    if floor:
        rows = query_neo4j("""
            MATCH (b:Building {name: $name})-[:HAS_FLOOR]->(f:Floor {floor: $floor})-[:HAS_ROOM]->(r:Room)
            RETURN r.room_no AS room_no, r.name AS name, r.type AS type, f.floor AS floor
            ORDER BY r.room_no
        """, {"name": building_name, "floor": floor})
    else:
        rows = query_neo4j("""
            MATCH (b:Building {name: $name})-[:HAS_FLOOR]->(f:Floor)-[:HAS_ROOM]->(r:Room)
            RETURN r.room_no AS room_no, r.name AS name, r.type AS type, f.floor AS floor
            ORDER BY f.floor, r.room_no
        """, {"name": building_name})
    return {"building": building_name, "floor": floor, "total": len(rows), "rooms": rows}


# ═══════════════════════════════════════════════
# 편의점 · 카페
# ═══════════════════════════════════════════════

@app.get("/campus/stores", tags=["편의점·카페"])
def get_stores(
    store_type: Optional[str] = Query(default=None, alias="type", description="유형 (편의점 or 카페)")
):
    """교내 편의점·카페 목록 조회"""
    if store_type:
        rows = query_neo4j("""
            MATCH (s:Store {type: $type})
            RETURN s.name AS name, s.type AS type, s.location AS location,
                   s.hours AS hours, s.restriction AS restriction, s.phone AS phone
            ORDER BY s.name
        """, {"type": store_type})
    else:
        rows = query_neo4j("""
            MATCH (s:Store)
            RETURN s.name AS name, s.type AS type, s.location AS location,
                   s.hours AS hours, s.restriction AS restriction, s.phone AS phone
            ORDER BY s.type, s.name
        """)
    return {"total": len(rows), "stores": rows}


# ═══════════════════════════════════════════════
# 부서 · 행정
# ═══════════════════════════════════════════════

@app.get("/campus/departments", tags=["부서·행정"])
def get_departments(
    dept_type: Optional[str] = Query(default=None, alias="type", description="부서 유형 (예: 행정부서)")
):
    """부서·행정실 목록 조회"""
    if dept_type:
        rows = query_neo4j("""
            MATCH (d:Department {type: $type})
            RETURN d.department_id AS id, d.name AS name, d.type AS type,
                   d.phone AS phone, d.email AS email, d.website AS website,
                   d.hours AS hours, d.description AS description
            ORDER BY d.name
        """, {"type": dept_type})
    else:
        rows = query_neo4j("""
            MATCH (d:Department)
            RETURN d.department_id AS id, d.name AS name, d.type AS type,
                   d.phone AS phone, d.email AS email, d.website AS website,
                   d.hours AS hours, d.description AS description
            ORDER BY d.type, d.name
        """)
    return {"total": len(rows), "departments": rows}


# ═══════════════════════════════════════════════
# 교통 (셔틀버스)
# ═══════════════════════════════════════════════

@app.get("/campus/transportation", tags=["교통"])
def get_transportation():
    """교내 셔틀버스 정류장 목록 및 노선 조회"""
    rows = query_neo4j("""
        MATCH (t:Transportation)
        RETURN t.transportation_id AS id, t.type AS type, t.name AS name,
               t.routes AS routes, t.hours AS hours, t.description AS description
        ORDER BY t.name
    """)
    return {"total": len(rows), "transportation": rows}


# ═══════════════════════════════════════════════
# 시설
# ═══════════════════════════════════════════════

@app.get("/campus/facilities", tags=["시설"])
def get_facilities():
    """교내 주요 시설 목록 조회 (IT지원, 전산실습실 등)"""
    rows = query_neo4j("""
        MATCH (f:Facility)
        OPTIONAL MATCH (f)-[:LOCATED_IN]->(b:Building)
        RETURN f.facility_id AS id, f.name AS name, f.type AS type,
               f.contact AS contact, f.description AS description,
               f.hours_wd AS hours_weekday, b.name AS building
        ORDER BY f.type, f.name
    """)
    return {"total": len(rows), "facilities": rows}


# ═══════════════════════════════════════════════
# 통합 검색
# ═══════════════════════════════════════════════

@app.get("/campus/search", tags=["검색"])
def search(
    q: str = Query(..., description="검색어 (건물명, 시설명, 매장명, 부서명 등)")
):
    """
    키워드로 건물·호실·편의점·부서·교통을 통합 검색합니다.
    예: /campus/search?q=편의점
        /campus/search?q=강의실
        /campus/search?q=셔틀버스
    """
    rows = query_neo4j("""
        MATCH (b:Building) WHERE b.name CONTAINS $q OR coalesce(b.alias,'') CONTAINS $q
        RETURN '건물' AS category, b.name AS name, b.map_num AS detail, b.zone AS location,
               b.latitude AS lat, b.longitude AS lng
        UNION
        MATCH (f:Floor)-[:HAS_ROOM]->(r:Room)
        WHERE r.name CONTAINS $q OR r.type CONTAINS $q
        RETURN '호실' AS category, r.name AS name, r.room_no AS detail, f.building_name AS location,
               null AS lat, null AS lng
        UNION
        MATCH (s:Store) WHERE s.name CONTAINS $q OR s.type CONTAINS $q
        RETURN '매장' AS category, s.name AS name, s.type AS detail, s.location AS location,
               null AS lat, null AS lng
        UNION
        MATCH (d:Department) WHERE d.name CONTAINS $q
        RETURN '부서' AS category, d.name AS name, d.type AS detail, '' AS location,
               null AS lat, null AS lng
        UNION
        MATCH (t:Transportation) WHERE t.name CONTAINS $q OR t.type CONTAINS $q
        RETURN '교통' AS category, t.name AS name, t.type AS detail, t.routes AS location,
               null AS lat, null AS lng
        LIMIT 50
    """, {"q": q})
    return {"query": q, "total": len(rows), "results": rows}
