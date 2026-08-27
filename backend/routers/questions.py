from __future__ import annotations

import logging
import os
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from services.graph_qa import answer_question, make_qa_llm, plan_question, query_fingerprint, retrieve


router = APIRouter(tags=["캠퍼스 질문"])
logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=500)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    language: Literal["ko", "en", "ja", "zh"] = "ko"
    current_stop_id: str = Field(default="", max_length=120)
    current_place_name: str = Field(default="", max_length=120)
    next_stop_id: str = Field(default="", max_length=120)
    current_lat: float | None = Field(default=None, ge=-90, le=90)
    current_lng: float | None = Field(default=None, ge=-180, le=180)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)


@router.post("/tour/questions")
def ask_question(payload: QuestionRequest, request: Request):
    try:
        llm = make_qa_llm()
        history = [message.model_dump() for message in payload.history]
        plan = plan_question(payload.question, payload.current_place_name, llm, history)
        evidence = retrieve(
            request.app.state.neo4j_driver,
            plan,
            payload.current_stop_id,
            payload.current_lat,
            payload.current_lng,
        )
        answer = answer_question(payload.question, payload.language, evidence, llm, history)
        return {
            "answer": answer,
            "evidence": evidence,
            "queryType": plan.intent,
            "queryFingerprint": query_fingerprint(plan),
        }
    except Exception as error:
        logger.exception("Tour question retrieval failed")
        raise HTTPException(status_code=503, detail="질문에 답변할 수 없습니다.") from error


@router.post("/speech/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Literal["ko", "en", "ja", "zh"] = Form("ko"),
):
    content = await audio.read()
    if not content or len(content) > 8_000_000:
        raise HTTPException(status_code=413, detail="음성 파일 크기가 올바르지 않습니다.")
    try:
        from google.cloud import speech_v1 as speech

        locale = {"ko": "ko-KR", "en": "en-US", "ja": "ja-JP", "zh": "cmn-Hans-CN"}[language]
        client = speech.SpeechClient()
        response = client.recognize(
            config=speech.RecognitionConfig(
                language_code=locale,
                enable_automatic_punctuation=True,
                model=os.getenv("STT_MODEL", "latest_short"),
            ),
            audio=speech.RecognitionAudio(content=content),
        )
        transcript = " ".join(
            result.alternatives[0].transcript
            for result in response.results
            if result.alternatives
        ).strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="음성을 인식하지 못했습니다.")
        return {"transcript": transcript}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="음성 인식을 사용할 수 없습니다.") from error
