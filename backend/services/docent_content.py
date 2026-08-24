"""Read normalized docent facts and selection rules from Neo4j."""

from __future__ import annotations

from typing import Any


def assemble_docent_context(
    entity_id: str,
    label: str,
    description: str,
    config: dict[str, Any] | None,
    facts: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply explicit selection rules or the default importance-based fallback."""
    normalized = sorted(
        facts,
        key=lambda fact: (-int(fact.get("importance") or 0), str(fact.get("factId") or "")),
    )
    if config:
        required = [fact for fact in normalized if fact.get("selection") == "required"]
        optional = [fact for fact in normalized if fact.get("selection") == "optional"]
    else:
        required = [fact for fact in normalized if int(fact.get("importance") or 0) >= 80][:3]
        required_ids = {fact["factId"] for fact in required}
        optional = [fact for fact in normalized if fact.get("factId") not in required_ids][:2]

    return {
        "entityId": entity_id,
        "label": label,
        "description": description or "",
        "enabled": bool(config.get("enabled", True)) if config else True,
        "openingLine": config.get("openingLine") if config else None,
        "targetDurationSeconds": int(config.get("targetDurationSeconds") or 45) if config else 45,
        "requiredFacts": required,
        "optionalFacts": optional,
        "usesDefaultRule": config is None,
    }


def get_docent_context(driver: Any, entity_id: str) -> dict[str, Any] | None:
    """Return a generation-ready context for any supported campus object."""
    with driver.session() as session:
        entity = session.run(
            """
            MATCH (entity)
            WHERE entity.place_id = $entity_id
               OR entity.spot_id = $entity_id
               OR entity.building_id = $entity_id
               OR entity.store_id = $entity_id
               OR entity.floor_id = $entity_id
               OR entity.room_id = $entity_id
               OR entity.facility_id = $entity_id
            OPTIONAL MATCH (entity)-[:HAS_DOCENT_CONFIG]->(config:DocentConfig)
            RETURN coalesce(entity.name, entity.room_no, $entity_id) AS label,
                   coalesce(entity.description, entity.main_function, entity.features, '') AS description,
                   CASE WHEN config IS NULL THEN null ELSE {
                       enabled: config.enabled,
                       openingLine: config.opening_line,
                       targetDurationSeconds: config.target_duration_seconds
                   } END AS config
            LIMIT 1
            """,
            entity_id=entity_id,
        ).single()
        if entity is None:
            return None
        facts = session.run(
            """
            MATCH (entity)-[:HAS_FACT]->(fact:Fact)
            WHERE entity.place_id = $entity_id
               OR entity.spot_id = $entity_id
               OR entity.building_id = $entity_id
               OR entity.store_id = $entity_id
               OR entity.floor_id = $entity_id
               OR entity.room_id = $entity_id
               OR entity.facility_id = $entity_id
            OPTIONAL MATCH (entity)-[:HAS_DOCENT_CONFIG]->(config:DocentConfig)-[choice]->(fact)
            WHERE choice:REQUIRES_FACT OR choice:OPTIONALLY_USES_FACT
            RETURN fact.fact_id AS factId,
                   fact.category AS category,
                   fact.content AS content,
                   fact.importance AS importance,
                   fact.verified AS verified,
                   fact.source_url AS sourceUrl,
                   CASE type(choice)
                       WHEN 'REQUIRES_FACT' THEN 'required'
                       WHEN 'OPTIONALLY_USES_FACT' THEN 'optional'
                       ELSE null
                   END AS selection
            """,
            entity_id=entity_id,
        )
        return assemble_docent_context(
            entity_id,
            entity["label"],
            entity["description"],
            entity["config"],
            [dict(fact) for fact in facts],
        )
