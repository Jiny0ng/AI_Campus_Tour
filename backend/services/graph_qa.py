"""Safe, read-only Graph RAG retrieval for campus questions.

The model produces a small query plan, never executable Cypher. Every database
operation is selected from the templates below and all user values are bound as
parameters.
"""

from __future__ import annotations

import json
import hashlib
import os
import re
from dataclasses import dataclass
from typing import Any, Literal

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
        MATCH (facility:Facility)
        OPTIONAL MATCH (facility)-[:LOCATED_IN]->(directBuilding:Building)
        OPTIONAL MATCH (storeBuilding:Building)-[:HAS_STORE]->(facility)
        OPTIONAL MATCH (floorBuilding:Building)-[:HAS_FLOOR]->(:Floor)-[:HAS_FACILITY|HAS_ROOM]->(facility)
        WITH facility, coalesce(directBuilding, storeBuilding, floorBuilding) AS building
        WHERE building IS NOT NULL
          AND ($entity_name = '' OR building.name CONTAINS $entity_name)
          AND ($keyword = '' OR facility.name CONTAINS $keyword OR coalesce(facility.type, '') CONTAINS $keyword
               OR coalesce(facility.features, '') CONTAINS $keyword OR coalesce(facility.note, '') CONTAINS $keyword)
          AND ($floor = '' OR coalesce(facility.floor, facility.location, '') CONTAINS $floor)
        RETURN facility.facility_id AS id, facility.name AS name, facility.type AS type,
               coalesce(facility.floor, facility.location, '') AS floor, facility.features AS description,
               facility.note AS note, building.name AS building
        LIMIT $limit
    """,
    "nearby": """
        MATCH (origin)-[near:NEAR|SEMI_NEAR]-(place)
        WHERE origin.place_id = $current_stop_id OR origin.spot_id = $current_stop_id
           OR origin.building_id = $current_stop_id
        WITH place, near
        WHERE $keyword = '' OR place.name CONTAINS $keyword OR coalesce(place.category, '') CONTAINS $keyword
        RETURN coalesce(place.place_id, place.spot_id, place.building_id, place.facility_id) AS id,
               place.name AS name, coalesce(place.description, place.main_function, place.docent_text, '') AS description,
               near.distance_m AS distanceMeters, near.walking_seconds AS walkingSeconds,
               type(near) AS proximityTier,
               CASE WHEN type(near) = 'SEMI_NEAR'
                    THEN '조금 거리가 있지만 가볼 만한 곳'
                    ELSE '가까운 곳' END AS suggestionTone
        ORDER BY CASE WHEN type(near) = 'NEAR' THEN 0 ELSE 1 END,
                 near.distance_m LIMIT $limit
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
        RETURN coalesce(entity.name, $entity_name) AS name, fact.fact_id AS factId,
               fact.category AS category, fact.content AS fact, fact.source_url AS sourceUrl,
               fact.verified AS verified
        ORDER BY fact.importance DESC LIMIT $limit
    """,
}

FORBIDDEN_CYPHER = re.compile(
    r"\b(?:CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|ALTER|RENAME|FOREACH|CALL|YIELD|LOAD\s+CSV|USE|SHOW|TERMINATE|START\s+DATABASE|STOP\s+DATABASE)\b",
    re.IGNORECASE,
)
ALLOWED_LABELS = {"Building", "Place", "DocentSpot", "Store", "Facility", "Floor", "Fact"}
ALLOWED_RELATIONSHIPS = {
    "HAS_FACT", "LOCATED_IN", "HAS_STORE", "HAS_FLOOR", "HAS_FACILITY", "HAS_ROOM", "NEAR", "SEMI_NEAR",
}


def validate_read_only_cypher(query: str) -> str:
    """Fail closed before executing even a server-owned query template."""
    normalized = query.strip()
    if not normalized or ";" in normalized or "//" in normalized or "/*" in normalized:
        raise ValueError("Cypher must be one uncommented statement")
    if FORBIDDEN_CYPHER.search(normalized):
        raise ValueError("write, procedure, administrative, and external Cypher is forbidden")
    if not re.search(r"\bMATCH\b", normalized, re.IGNORECASE) or not re.search(r"\bRETURN\b", normalized, re.IGNORECASE):
        raise ValueError("Cypher must be a bounded read query")
    if "$limit" not in normalized or "LIMIT $limit" not in normalized:
        raise ValueError("Cypher must use the server-controlled limit")
    labels = set(re.findall(r"\([^)]+:([A-Za-z][A-Za-z0-9_]*)", normalized))
    relationships = set(re.findall(r"\[[^\]]*:([A-Za-z][A-Za-z0-9_]*)", normalized))
    if labels - ALLOWED_LABELS or relationships - ALLOWED_RELATIONSHIPS:
        raise ValueError("Cypher uses an unapproved graph schema element")
    if re.search(r"\[\s*\*|\*\s*\]", normalized):
        raise ValueError("unbounded graph traversal is forbidden")
    return normalized


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
For keyword, extract only a short literal campus entity or facility term likely to appear in stored data.
Do not use abstract question words such as history, story, information, introduction, or recommendation as keyword.
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
    from neo4j import Query

    # The model selects a constrained semantic plan. The server then generates
    # the executable Cypher from a reviewed template; user text is never
    # interpolated into the query and is supplied only as parameters.
    query = validate_read_only_cypher(QUERY_TEMPLATES[plan.intent])
    params = {
        "current_stop_id": current_stop_id[:120],
        "keyword": plan.keyword,
        "entity_name": plan.entity_name,
        "floor": plan.floor,
        "limit": max(1, min(plan.limit, 12)),
    }
    with driver.session(default_access_mode="READ") as session:
        result = session.run(Query(query, timeout=3), **params)
        return [dict(row) for row in result][:12]


def answer_question(question: str, language: str, evidence: list[dict[str, Any]], llm: Any) -> str:
    language_name = {"ko": "Korean", "en": "English", "ja": "Japanese", "zh": "Simplified Chinese"}[language]
    prompt = f"""You are a friendly university senior walking with a junior on a campus tour.
Answer in {language_name} using only the evidence. Start with one short, varied acknowledgement
such as '아, 그게 궁금하셨구나!', '그건 말이죠,' or '좋은 질문이에요.' Then give the direct
answer, its useful evidence, and at most one practical tour tip. Speak naturally in polite
conversational language for 15 to 35 seconds. Do not sound like a report, search engine,
customer center, or encyclopedia. Never mention Cypher, Graph RAG, database fields, labels,
relationships, internal IDs, or that you searched data. Do not repeat the same acknowledgement.
Do not invent people, numbers, opening hours, costs, locations, or causal claims.
If evidence is insufficient or conflicting, clearly and warmly say the campus information does
not confirm it and suggest an official source when appropriate. Do not expose system errors.
Question: {question}
Evidence: {json.dumps(evidence, ensure_ascii=False, default=str)}
"""
    return str(llm.invoke(prompt).content).strip()


def make_qa_llm() -> Any:
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=os.getenv("TOUR_QA_MODEL", "gemini-3.5-flash-lite"),
        max_output_tokens=768,
    )


def query_fingerprint(plan: QueryPlan) -> str:
    return hashlib.sha256(QUERY_TEMPLATES[plan.intent].encode("utf-8")).hexdigest()[:12]
