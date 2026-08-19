from fastapi import APIRouter, Request, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from langchain_google_genai import ChatGoogleGenerativeAI

router = APIRouter(prefix="/campus/buildings", tags=["건물 리뷰"])

class ReviewCreate(BaseModel):
    user_id: str
    rating: int
    content: str

def get_llm():
    return ChatGoogleGenerativeAI(model="gemini-3.6-flash", temperature=0.7)

@router.post("/{building_name}/reviews")
async def create_review(building_name: str, review: ReviewCreate, request: Request):
    """특정 건물에 리뷰 작성"""
    driver = request.app.state.neo4j_driver
    current_time = datetime.now().isoformat()
    
    with driver.session() as session:
        result = session.run("MATCH (b:Building {name: $name}) RETURN b", {"name": building_name}).single()
        if not result:
            raise HTTPException(status_code=404, detail="건물을 찾을 수 없습니다.")
        
        session.run("""
            MATCH (b:Building {name: $name})
            CREATE (r:Review {
                user_id: $user_id,
                rating: $rating,
                content: $content,
                created_at: $created_at
            })
            CREATE (r)-[:ABOUT]->(b)
        """, {
            "name": building_name,
            "user_id": review.user_id,
            "rating": review.rating,
            "content": review.content,
            "created_at": current_time
        })
    
    return {"status": "success", "message": "리뷰가 등록되었습니다."}

@router.get("/{building_name}/reviews")
async def get_reviews(building_name: str, request: Request):
    """특정 건물의 리뷰 목록 및 AI 요약본 조회"""
    driver = request.app.state.neo4j_driver
    
    with driver.session() as session:
        b_result = session.run("MATCH (b:Building {name: $name}) RETURN b.summary AS summary", {"name": building_name}).single()
        if not b_result:
            raise HTTPException(status_code=404, detail="건물을 찾을 수 없습니다.")
        
        summary = b_result["summary"]
        
        r_result = session.run("""
            MATCH (r:Review)-[:ABOUT]->(b:Building {name: $name})
            RETURN r.user_id AS user_id, r.rating AS rating, r.content AS content, r.created_at AS created_at
            ORDER BY r.created_at DESC
        """, {"name": building_name})
        
        reviews = [record.data() for record in r_result]
        
    return {
        "building": building_name,
        "summary": summary,
        "total_reviews": len(reviews),
        "reviews": reviews
    }

@router.post("/{building_name}/reviews/summarize")
async def summarize_reviews(building_name: str, request: Request):
    """특정 건물의 리뷰들을 LLM으로 요약하고 DB에 캐싱"""
    driver = request.app.state.neo4j_driver
    
    with driver.session() as session:
        check = session.run("MATCH (b:Building {name: $name}) RETURN b", {"name": building_name}).single()
        if not check:
            raise HTTPException(status_code=404, detail="건물을 찾을 수 없습니다.")
            
        r_result = session.run("""
            MATCH (r:Review)-[:ABOUT]->(b:Building {name: $name})
            RETURN r.rating AS rating, r.content AS content
        """, {"name": building_name})
        
        reviews = [record.data() for record in r_result]
        
    if not reviews:
        return {"status": "success", "message": "요약할 리뷰가 없습니다."}
        
    reviews_text = "\n".join([f"- 평점: {r['rating']}점, 내용: {r['content']}" for r in reviews])
    prompt = f"""
다음은 '{building_name}' 건물에 대한 사용자들의 리뷰 목록입니다.
이 리뷰들을 종합하여 해당 건물에 대한 1~2줄짜리 짧은 총평(요약본)을 작성해주세요.

[리뷰 목록]
{reviews_text}

[총평]
"""
    
    try:
        llm = get_llm()
        response = llm.invoke(prompt)
        summary = response.content.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 요약 실패: {str(e)}")
        
    with driver.session() as session:
        session.run("""
            MATCH (b:Building {name: $name})
            SET b.summary = $summary
        """, {"name": building_name, "summary": summary})
        
    return {
        "status": "success",
        "message": "리뷰 요약이 완료되었습니다.",
        "summary": summary
    }
