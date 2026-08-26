"""Safe, read-only Graph RAG retrieval for campus questions.

The model produces a small query plan, never executable Cypher. Every database
operation is selected from the templates below and all user values are bound as
parameters.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any, Literal

from langchain_google_genai import ChatGoogleGenerativeAI


Intent = Literal["current_place", "facility", "nearby", "place_search", "facts"]
ALLOWED_INTENTS: set[str] = {"current_place", "facility", "nearby", "place_search", "facts"}


@dataclass(frozen=True)
class QueryPlan:
    intent: Intent
    keyword: str
    entity_name: str
    floor: str
    limit: int = 8


QUERY_TEMPLATES: dict[Intent, str] = {
    "current_place": """
        MATCH (entity)
        WHERE entity.place_id = $current_stop_id OR entity.spot_id = $current_stop_id
           OR entity.building_id = $current_stop_id OR entity.facility_id = $current_stop_id
        OPTIONAL MATCH (entity)-[:HAS_FACT]->(fact:Fact)
        RETURN coalesce(entity.name, $current_stop_id) AS name,
               coalesce(entity.description, entity.main_function, entity.docent_text, '') AS description,
               fact.content AS fact, fact.source_url AS sourceUrl
        ORDER BY fact.importance DESC LIMIT $limit
    """,
    "facility": """
        MATCH (facility:Facility)-[:LOCATED_IN]->(building:Building)
        WHERE ($entity_name = '' OR building.name CONTAINS $entity_name)
          AND ($keyword = '' OR facility.name CONTAINS $keyword OR facility.type CONTAINS $keyword
               OR facility.features CONTAINS $keyword OR facility.note CONTAINS $keyword)
          AND ($floor = '' OR facility.floor = $floor)
        RETURN facility.facility_id AS id, facility.name AS name, facility.type AS type,
               facility.floor AS floor, facility.features AS description,
               facility.note AS note, building.name AS building
        LIMIT $limit
    """,
    "nearby": """
        MATCH (origin)-[near:NEAR]-(place)
        WHERE origin.place_id = $current_stop_id OR origin.spot_id = $current_stop_id
           OR origin.building_id = $current_stop_id
        WITH place, near
        WHERE $keyword = '' OR place.name CONTAINS $keyword OR coalesce(place.category, '') CONTAINS $keyword
        RETURN coalesce(place.place_id, place.spot_id, place.building_id, place.facility_id) AS id,
               place.name AS name, coalesce(place.description, place.main_function, place.docent_text, '') AS description,
               near.distance_m AS distanceMeters, near.walking_seconds AS walkingSeconds
        ORDER BY near.distance_m LIMIT $limit
    """,
    "place_search": """
        MATCH (place)
        WHERE (place:Building OR place:Place OR place:DocentSpot OR place:Store)
          AND ($keyword = '' OR place.name CONTAINS $keyword OR coalesce(place.alias, '') CONTAINS $keyword
               OR coalesce(place.description, '') CONTAINS $keyword)
        RETURN coalesce(place.place_id, place.spot_id, place.building_id, place.store_id) AS id,
               place.name AS name, labels(place) AS labels,
               coalesce(place.description, place.main_function, place.docent_text, '') AS description,
               place.latitude AS latitude, place.longitude AS longitude
        LIMIT $limit
    """,
    "facts": """
        MATCH (entity)-[:HAS_FACT]->(fact:Fact)
        WHERE ($current_stop_id <> '' AND (entity.place_id = $current_stop_id OR entity.spot_id = $current_stop_id
               OR entity.building_id = $current_stop_id))
           OR ($entity_name <> '' AND entity.name CONTAINS $entity_name)
        WITH entity, fact
        WHERE $keyword = '' OR fact.content CONTAINS $keyword OR fact.category CONTAINS $keyword
        RETURN coalesce(entity.name, $entity_name) AS name, fact.fact_id AS factId,
               fact.category AS category, fact.content AS fact, fact.source_url AS sourceUrl,
               fact.verified AS verified
        ORDER BY fact.importance DESC LIMIT $limit
    """,
}


def _json_object(content: Any) -> dict[str, Any]:
    text = str(content)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def plan_question(question: str, current_place_name: str, llm: Any) -> QueryPlan:
    prompt = f"""You convert a campus question into a safe retrieval plan.
Return JSON only with keys intent, keyword, entity_name, floor.
Allowed intent: current_place, facility, nearby, place_search, facts.
Use an empty string for an unknown field. Never write Cypher.
Current place: {current_place_name}
Question: {question}
"""
    parsed = _json_object(llm.invoke(prompt).content)
    intent = str(parsed.get("intent", "facts"))
    if intent not in ALLOWED_INTENTS:
        intent = "facts"
    return QueryPlan(
        intent=intent,  # type: ignore[arg-type]
        keyword=str(parsed.get("keyword", ""))[:80].strip(),
        entity_name=str(parsed.get("entity_name", ""))[:80].strip(),
        floor=str(parsed.get("floor", ""))[:20].strip(),
    )


def retrieve(driver: Any, plan: QueryPlan, current_stop_id: str) -> list[dict[str, Any]]:
    query = QUERY_TEMPLATES[plan.intent]
    params = {
        "current_stop_id": current_stop_id[:120],
        "keyword": plan.keyword,
        "entity_name": plan.entity_name,
        "floor": plan.floor,
        "limit": max(1, min(plan.limit, 12)),
    }
    with driver.session(default_access_mode="READ") as session:
        return [dict(row) for row in session.run(query, **params)]


def answer_question(question: str, language: str, evidence: list[dict[str, Any]], llm: Any) -> str:
    language_name = {"ko": "Korean", "en": "English", "ja": "Japanese", "zh": "Simplified Chinese"}[language]
    prompt = f"""You are a friendly campus docent. Answer in {language_name} using only the evidence.
If the evidence is insufficient, clearly say that the campus data does not confirm the answer.
Keep the answer concise and suitable for spoken playback. Do not mention Cypher or internal IDs.
Question: {question}
Evidence: {json.dumps(evidence, ensure_ascii=False, default=str)}
"""
    return str(llm.invoke(prompt).content).strip()


def make_qa_llm() -> Any:
    return ChatGoogleGenerativeAI(
        model=os.getenv("TOUR_QA_MODEL", "gemini-3.5-flash-lite"),
        max_output_tokens=768,
    )
