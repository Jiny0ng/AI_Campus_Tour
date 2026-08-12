from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import yaml
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate

router = APIRouter(prefix="/tour", tags=["캠퍼스 투어"])

class TourRequest(BaseModel):
    start_location: str
    theme: Optional[str] = "일반 투어"

class FeedbackRequest(BaseModel):
    current_location: str
    current_tour_waypoints: List[str]
    user_feedback: str

# 퓨샷 프롬프트 로드 유틸리티
def load_prompt(filename: str):
    path = os.path.join(os.path.dirname(__file__), "..", "prompts", filename)
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

# LLM 초기화 (환경변수에 GOOGLE_API_KEY 필요)
def get_llm():
    return ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.7)

@router.post("/init")
async def init_tour(req: TourRequest, request: Request):
    """
    투어 시작 API
    1. 시작 위치와 테마에 맞춰 추천 경로(웨이포인트) 생성 (Graph DB 탐색)
    2. 경로를 따라 이동하며 발생할 도슨트(Docent) 대본 일괄 사전 생성 (LLM)
    """
    driver = request.app.state.neo4j_driver
    
    # 1. DB에서 추천 웨이포인트(주요 건물) 탐색 (예시 쿼리)
    # 실제로는 A* 알고리즘이나 CONNECTED_TO 관계를 활용해야 함.
    # 여기서는 시작 위치가 DB에 있는지 확인 후, 임의의 투어 경로를 반환합니다.
    waypoints = []
    with driver.session() as session:
        check = session.run("MATCH (b:Building) WHERE b.name CONTAINS $name RETURN b.name AS name LIMIT 1", {"name": req.start_location}).single()
        if not check:
            waypoints = [req.start_location, "진수당", "도서관", "건지광장"]
        else:
            waypoints = [check["name"], "진수당", "도서관", "건지광장"] # 추후 Graph Routing 쿼리로 교체

    # 2. LLM을 통한 도슨트 일괄 생성
    docent_prompt_data = load_prompt("docent_few_shot.yaml")
    system_msg = docent_prompt_data["system_prompt"]
    
    llm = get_llm()
    docents = []
    
    for i in range(len(waypoints) - 1):
        curr_loc = waypoints[i]
        next_loc = waypoints[i+1]
        
        # DB에서 주변 POI (편의점/카페) 정보 조회
        nearby_pois = []
        with driver.session() as session:
            rows = session.run("""
                MATCH (b:Building {name: $curr})
                OPTIONAL MATCH (b)-[:HAS_STORE]->(s:Store)
                RETURN s.name AS name, s.type AS type
            """, {"curr": curr_loc})
            for r in rows:
                if r["name"]:
                    nearby_pois.append({"name": r["name"], "type": r["type"]})
        
        prompt_str = f"{system_msg}\n\n현재 위치: {curr_loc}\n다음 장소: {next_loc}\n주변 시설: {nearby_pois}\n방향: 정면\n\n도슨트 안내 멘트를 작성해줘."
        
        try:
            response = llm.invoke(prompt_str)
            docents.append({
                "trigger_point": curr_loc,
                "direction_alpha": 0,
                "text": response.content
            })
        except Exception as e:
            docents.append({
                "trigger_point": curr_loc,
                "direction_alpha": 0,
                "text": f"{curr_loc}에서 {next_loc}(으)로 이동합니다."
            })

    return {
        "status": "success",
        "message": f"'{req.start_location}'에서 시작하는 '{req.theme}' 경로 생성 완료",
        "waypoints": waypoints,
        "docents": docents
    }

@router.post("/update")
async def update_tour(req: FeedbackRequest, request: Request):
    """
    동적 경로 수정 API
    유저의 피드백을 반영하여 남은 경로를 수정하고 도슨트를 재생성합니다.
    """
    route_prompt_data = load_prompt("route_few_shot.yaml")
    system_msg = route_prompt_data["system_prompt"]
    
    llm = get_llm()
    prompt_str = f"{system_msg}\n\n현재 남은 경로: {req.current_tour_waypoints}\n사용자 피드백: {req.user_feedback}\n\n결과를 JSON으로 반환해."
    
    try:
        response = llm.invoke(prompt_str)
        # TODO: JSON 파싱 및 구조화 처리
        raw_result = response.content
    except Exception as e:
        raw_result = str(e)
    
    return {
        "status": "success",
        "message": "피드백이 반영되어 경로가 수정되었습니다.",
        "llm_raw_response": raw_result,
        "updated_waypoints": ["수정된 경로 1", "수정된 경로 2"],
        "new_docents": []
    }
