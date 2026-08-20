"""Back up, audit, and conservatively repair the CampusTour Neo4j graph.

The repair is intentionally additive: it does not delete or merge source nodes.
Run without ``--apply`` for a read-only report, or with ``--apply`` to create a
JSON snapshot and add only high-confidence relationships.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase


DATA_DIR = Path(__file__).resolve().parent
BACKUP_DIR = Path(os.getenv("GRAPH_BACKUP_DIR", str(DATA_DIR / "backups")))


def records(session, query: str) -> list[dict[str, Any]]:
    return [dict(record) for record in session.run(query)]


def audit(session) -> dict[str, Any]:
    queries = {
        "totals": """
            MATCH (n)
            WITH count(n) AS nodes
            CALL { MATCH ()-[r]->() RETURN count(r) AS relationships }
            RETURN nodes, relationships
        """,
        "isolated": """
            MATCH (n) WHERE NOT (n)--()
            UNWIND labels(n) AS label
            RETURN label, coalesce(n.source, '(none)') AS source, count(*) AS count
            ORDER BY count DESC
        """,
        "dangling_floors": """
            MATCH (f:Floor) WHERE NOT (:Building)-[:HAS_FLOOR]->(f)
            RETURN count(f) AS count
        """,
        "dangling_rooms": """
            MATCH (r:Room) WHERE NOT (:Floor)-[:HAS_ROOM]->(r)
            RETURN count(r) AS count
        """,
        "ambiguous_stores": """
            MATCH (b:Building)-[:HAS_STORE]->(s:Store)
            WITH s, count(b) AS degree WHERE degree > 1
            RETURN s.name AS store, s.location AS location, degree
            ORDER BY degree DESC, store
        """,
    }
    return {name: records(session, query) for name, query in queries.items()}


def backup(session) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = BACKUP_DIR / f"neo4j-before-graph-repair-{timestamp}.json"
    nodes = records(
        session,
        "MATCH (n) RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties",
    )
    relationships = records(
        session,
        """
        MATCH (a)-[r]->(b)
        RETURN elementId(r) AS id, type(r) AS type,
               elementId(a) AS start, elementId(b) AS end,
               properties(r) AS properties
        """,
    )
    target.write_text(
        json.dumps(
            {
                "created_at": datetime.now(timezone.utc).isoformat(),
                "nodes": nodes,
                "relationships": relationships,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return target


def repair(session) -> dict[str, int]:
    session.run(
        "CREATE CONSTRAINT campus_id IF NOT EXISTS FOR (c:Campus) REQUIRE c.campus_id IS UNIQUE"
    ).consume()
    session.run(
        """
        MERGE (campus:Campus {campus_id: 'jbnu-jeonju'})
        SET campus.name = '전북대학교 전주캠퍼스',
            campus.source = 'graph_audit_repair.py'
        WITH campus
        MATCH (n)
        WHERE n:Building OR n:Department OR n:Transportation OR
              n:Facility OR n:TourStop OR n:DocentSpot
        MERGE (n)-[:PART_OF_CAMPUS]->(campus)
        """
    ).consume()

    floor_result = session.run(
        """
        MATCH (floor:Floor)
        WHERE NOT (:Building)-[:HAS_FLOOR]->(floor)
          AND floor.building_name IS NOT NULL
        MATCH (building:Building {source: 'parsed'})
        WHERE building.name CONTAINS floor.building_name
        WITH floor, collect(building) AS candidates
        WHERE size(candidates) = 1
        WITH floor, candidates[0] AS building
        MERGE (building)-[:HAS_FLOOR]->(floor)
        RETURN count(*) AS linked
        """
    ).single()

    same_as_result = session.run(
        """
        MATCH (room:Room), (facility:Facility)
        WHERE NOT (:Floor)-[:HAS_ROOM]->(room)
          AND room.name = facility.name
          AND room.source_url = facility.source_url
        MERGE (room)-[:SAME_AS]->(facility)
        RETURN count(*) AS linked
        """
    ).single()

    near_result = session.run(
        """
        MATCH (spot:DocentSpot)
        WHERE spot.latitude IS NOT NULL AND spot.longitude IS NOT NULL
        CALL {
            WITH spot
            MATCH (building:Building {source: 'nodes_building.csv'})
            WHERE building.latitude IS NOT NULL AND building.longitude IS NOT NULL
            WITH building,
                 point.distance(
                    point({latitude: spot.latitude, longitude: spot.longitude}),
                    point({latitude: building.latitude, longitude: building.longitude})
                 ) AS distance_m
            ORDER BY distance_m
            LIMIT 1
            RETURN building, distance_m
        }
        WITH spot, building, distance_m WHERE distance_m <= 300
        MERGE (spot)-[near:NEAR]->(building)
        SET near.distance_m = round(distance_m), near.method = 'nearest_official_building'
        RETURN count(*) AS linked
        """
    ).single()

    return {
        "floors_linked": floor_result["linked"] if floor_result else 0,
        "duplicate_rooms_linked": same_as_result["linked"] if same_as_result else 0,
        "docent_spots_linked": near_result["linked"] if near_result else 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    driver = GraphDatabase.driver(
        os.getenv("NEO4J_URI", "bolt://localhost:7687"),
        auth=(os.getenv("NEO4J_USER", "neo4j"), os.getenv("NEO4J_PASSWORD", "password")),
    )
    try:
        with driver.session() as session:
            before = audit(session)
            result: dict[str, Any] = {"before": before, "applied": False}
            if args.apply:
                result["backup"] = str(backup(session))
                result["changes"] = repair(session)
                result["after"] = audit(session)
                result["applied"] = True
            print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        driver.close()


if __name__ == "__main__":
    main()
