"""Load the current campus CSV files into Neo4j.

The loader is idempotent by default. Pass ``--reset`` only when a full graph
rebuild is explicitly required.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

from neo4j import GraphDatabase
from neo4j.exceptions import ClientError

from near_relations import build_near_relations, read_manual_overrides, read_place_candidates


NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
DATA_DIR = Path(__file__).resolve().parent
CANONICAL_PLACES = "campus_places.csv"
CANONICAL_INTERIORS = "campus_interiors.csv"
CANONICAL_FACTS = "campus_facts.csv"
CANONICAL_DOCENTS = "campus_docents.csv"

FACILITY_BUILDING_NAMES = {
    "박물관", "법학도서관", "무진동실험실", "삼성문화회관",
    "자연사박물관", "전대학술문화회관", "전북대학교 체육관",
    "중앙도서관", "창조2관", "풍동실험실", "한승헌도서관",
}
FACILITY_ROOM_SUFFIXES = (
    "학습실", "열람실", "휴게실", "휴게소", "라운지", "전산실", "전산실습실",
)


def read_csv(filename: str) -> list[dict[str, str]]:
    canonical_types = {
        "nodes_building.csv": "building",
        "nodes_parking.csv": "parking",
        "nodes_store.csv": "store",
        "nodes_docent_spot.csv": "docent_spot",
        "tour_route.csv": "tour_stop",
        "nodes_floor.csv": "floor",
        "nodes_room.csv": "room",
        "nodes_facility.csv": "facility",
    }
    if filename in canonical_types:
        canonical_filename = (
            CANONICAL_INTERIORS if filename in {"nodes_floor.csv", "nodes_room.csv", "nodes_facility.csv"}
            else CANONICAL_PLACES
        )
        canonical_path = DATA_DIR / canonical_filename
        if canonical_path.is_file():
            with canonical_path.open("r", encoding="utf-8-sig", newline="") as file:
                all_rows = [
                    {str(key).strip(): (value or "").strip() for key, value in row.items()}
                    for row in csv.DictReader(file, skipinitialspace=True)
                ]
            rows = [row for row in all_rows if row.get("entity_type") == canonical_types[filename]]
            building_names = {
                row["id"]: row["name"] for row in all_rows
                if row.get("entity_type") == "building"
            }
            converted = []
            for row in rows:
                normalized = dict(row)
                normalized.update({
                    "code": row.get("building_code", ""),
                    "no": row.get("legacy_no", ""),
                    "type": row.get("category", ""),
                    "spot_id": row.get("id", ""),
                    "spot_type": row.get("subcategory", ""),
                    "place_id": row.get("id", ""),
                    "order": row.get("tour_order", ""),
                })
                if row.get("entity_type") == "store":
                    normalized["building_name"] = building_names.get(row.get("parent_id", ""), "")
                converted.append(normalized)
            return converted
    raise ValueError(f"Unsupported campus CSV view: {filename}")


def read_content_csv(filename: str) -> list[dict[str, str]]:
    path = DATA_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required docent content CSV is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [
            {str(key).strip(): (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(file, skipinitialspace=True)
        ]


def parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized not in {"true", "false"}:
        raise ValueError(f"Expected true or false, got {value!r}")
    return normalized == "true"


def split_ids(value: str) -> list[str]:
    return [item.strip() for item in value.split("|") if item.strip()]


def optional_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def run(driver, query: str, **parameters: Any) -> None:
    with driver.session() as session:
        session.run(query, **parameters).consume()


def ensure_unique(values: Iterable[str], label: str) -> None:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    if duplicates:
        raise ValueError(f"Duplicate {label}: {', '.join(sorted(duplicates))}")


def validate_source_data() -> None:
    buildings = read_csv("nodes_building.csv")
    parkings = read_csv("nodes_parking.csv")
    stores = read_csv("nodes_store.csv")
    route = read_csv("tour_route.csv")

    building_names = [row["name"] for row in buildings if row["name"]]
    ensure_unique(building_names, "building names")
    store_names = [row["name"] for row in stores if row["name"]]
    ensure_unique(store_names, "store names")
    missing_store_mappings = sorted(
        row["name"] for row in stores if row["name"] and not row.get("building_name")
    )
    store_targets = {row.get("building_name", "") for row in stores if row["name"]}
    missing_store_buildings = sorted(store_targets - set(building_names) - {""})
    if missing_store_mappings:
        raise ValueError(f"Stores need exact building mappings: {', '.join(missing_store_mappings)}")
    if missing_store_buildings:
        raise ValueError(f"Store target buildings are missing: {', '.join(missing_store_buildings)}")

    route_ids = [row["place_id"] for row in route]
    route_orders = [row["order"] for row in route]
    ensure_unique(route_ids, "tour place IDs")
    ensure_unique(route_orders, "tour orders")

    expected_orders = list(range(1, len(route) + 1))
    actual_orders = sorted(int(order) for order in route_orders)
    if actual_orders != expected_orders:
        raise ValueError(
            f"Tour order must be continuous: expected {expected_orders}, got {actual_orders}"
        )

    for row in route:
        if not row["place_id"] or not row["name"]:
            raise ValueError(f"Tour stop needs place_id and name: {row}")
        if optional_float(row["latitude"]) is None or optional_float(row["longitude"]) is None:
            raise ValueError(f"Tour stop needs valid coordinates: {row['place_id']}")

    all_entities = read_csv("nodes_building.csv") + parkings + read_csv("nodes_store.csv")
    all_entities += read_csv("nodes_docent_spot.csv") + read_csv("tour_route.csv")
    all_entities += read_csv("nodes_floor.csv") + read_csv("nodes_room.csv")
    all_entities += read_csv("nodes_facility.csv")
    entity_ids = {row["id"] for row in all_entities if row.get("id")}
    near_candidate_ids = {row["id"] for row in read_place_candidates()}
    for override in read_manual_overrides():
        pair = (override.get("from_id", ""), override.get("to_id", ""))
        if override.get("action") not in {"include", "exclude"}:
            raise ValueError(f"Near override needs include or exclude action: {override}")
        if not all(entity_id in near_candidate_ids for entity_id in pair) or pair[0] == pair[1]:
            raise ValueError(f"Near override needs two distinct coordinate-bearing place IDs: {override}")
        if (override.get("verified") or "true").lower() not in {"true", "false"}:
            raise ValueError(f"Near override verified must be true or false: {override}")
        if override.get("action") == "include" and not (
            override.get("distance_m") or override.get("walking_seconds")
        ):
            raise ValueError(f"Included near override needs distance or walking time: {override}")
    facts = read_content_csv(CANONICAL_FACTS)
    docents = read_content_csv(CANONICAL_DOCENTS)
    fact_ids = [row.get("fact_id", "") for row in facts]
    ensure_unique(fact_ids, "fact IDs")
    ensure_unique((row.get("entity_id", "") for row in docents), "docent entity IDs")
    for fact in facts:
        if not fact.get("fact_id") or fact.get("entity_id") not in entity_ids:
            raise ValueError(f"Fact needs a valid fact_id and entity_id: {fact}")
        importance = optional_float(fact.get("importance", ""))
        if importance is None or not 0 <= importance <= 100:
            raise ValueError(f"Fact importance must be between 0 and 100: {fact['fact_id']}")
        parse_bool(fact.get("verified", ""))
    facts_by_entity: dict[str, set[str]] = {}
    for fact in facts:
        facts_by_entity.setdefault(fact["entity_id"], set()).add(fact["fact_id"])
    for docent in docents:
        entity_id = docent.get("entity_id", "")
        if entity_id not in entity_ids:
            raise ValueError(f"Docent config points to an unknown entity: {entity_id}")
        parse_bool(docent.get("enabled", ""))
        target_duration = optional_float(docent.get("target_duration_seconds", ""))
        if target_duration is None or target_duration <= 0:
            raise ValueError(f"Docent duration must be positive: {entity_id}")
        configured = split_ids(docent.get("required_fact_ids", "")) + split_ids(
            docent.get("optional_fact_ids", "")
        )
        missing = sorted(set(configured) - facts_by_entity.get(entity_id, set()))
        if missing:
            raise ValueError(f"Docent config {entity_id} references unknown facts: {missing}")


def create_indexes(driver) -> None:
    queries = (
        "CREATE CONSTRAINT campus_id IF NOT EXISTS FOR (n:Campus) REQUIRE n.campus_id IS UNIQUE",
        "CREATE INDEX building_name IF NOT EXISTS FOR (n:Building) ON (n.name)",
        "CREATE CONSTRAINT tour_stop_id IF NOT EXISTS FOR (n:TourStop) REQUIRE n.place_id IS UNIQUE",
        "CREATE CONSTRAINT docent_spot_id IF NOT EXISTS FOR (n:DocentSpot) REQUIRE n.spot_id IS UNIQUE",
        "CREATE INDEX store_name IF NOT EXISTS FOR (n:Store) ON (n.name)",
        "CREATE INDEX floor_building IF NOT EXISTS FOR (n:Floor) ON (n.building_name)",
        "CREATE INDEX room_building IF NOT EXISTS FOR (n:Room) ON (n.building_name)",
        "CREATE CONSTRAINT interior_facility_id IF NOT EXISTS FOR (n:Facility) REQUIRE n.facility_id IS UNIQUE",
        "CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (n:Fact) REQUIRE n.fact_id IS UNIQUE",
        "CREATE CONSTRAINT docent_config_id IF NOT EXISTS FOR (n:DocentConfig) REQUIRE n.entity_id IS UNIQUE",
    )
    for query in queries:
        try:
            run(driver, query)
        except ClientError as error:
            if error.code != "Neo.ClientError.Schema.IndexAlreadyExists":
                raise
            print(f"Skipped constraint because a compatible index already exists: {query}")


def building_name_lookup() -> tuple[dict[str, str], dict[str, str]]:
    rows = read_csv("nodes_building.csv")
    by_name = {row["name"]: row["name"] for row in rows if row["name"]}
    by_code = {
        row["code"]: row["name"]
        for row in rows
        if row["code"] and row["name"]
    }
    return by_name, by_code


def canonical_building_name(
    row: dict[str, str], by_name: dict[str, str], by_code: dict[str, str]
) -> str | None:
    code = row.get("building_code", "")
    name = row.get("building_name", "")
    return by_code.get(code) or by_name.get(name)


def load_buildings(driver) -> int:
    rows = read_csv("nodes_building.csv")
    batch = [
        {
            "building_id": row["id"],
            "code": row["code"] or None,
            "name": row["name"],
            "main_function": row["main_function"],
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
            "coordinate_source": row["coordinate_source"],
            "source_url": row["source_url"],
            "related_content": row["related_content"],
            "is_facility": row["name"] in FACILITY_BUILDING_NAMES,
        }
        for row in rows
        if row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (building:Building {name: row.name})
        SET building:Place,
            building.building_id = row.building_id,
            building.code = row.code,
            building.main_function = row.main_function,
            building.latitude = row.latitude,
            building.longitude = row.longitude,
            building.coordinate_source = row.coordinate_source,
            building.source_url = row.source_url,
            building.related_content = row.related_content,
            building.source = 'campus_places.csv'
        FOREACH (_ IN CASE WHEN row.is_facility THEN [1] ELSE [] END |
            SET building:Facility,
                building.facility_label_source = 'campus_places.csv'
        )
        """,
        batch=batch,
    )
    return len(batch)


def load_parkings(driver) -> int:
    rows = read_csv("nodes_parking.csv")
    batch = [
        {
            "place_id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "address": row["location"],
            "phone": row["phone"],
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
            "coordinate_source": row["coordinate_source"],
        }
        for row in rows
        if row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (parking:Parking:Place {place_id: row.place_id})
        SET parking.name = row.name,
            parking.type = '주차장',
            parking.description = row.description,
            parking.address = row.address,
            parking.phone = row.phone,
            parking.latitude = row.latitude,
            parking.longitude = row.longitude,
            parking.coordinate_source = row.coordinate_source,
            parking.source = 'campus_places.csv'
        """,
        batch=batch,
    )
    return len(batch)


def load_tour_stops(driver) -> int:
    rows = sorted(read_csv("tour_route.csv"), key=lambda row: int(row["order"]))
    batch = [
        {
            "order": int(row["order"]),
            "place_id": row["place_id"],
            "name": row["name"],
            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),
        }
        for row in rows
    ]
    # A physical place may also be a tour stop. Reuse an existing Building or
    # DocentSpot with the same name instead of creating a parallel place node.
    with driver.session() as session:
        for row in batch:
            existing = session.run(
                "MATCH (stop:TourStop {place_id: $place_id}) RETURN elementId(stop) AS id",
                place_id=row["place_id"],
            ).single()
            target_id = existing["id"] if existing else None
            if target_id is None:
                candidate = session.run(
                    """
                    MATCH (candidate)
                    WHERE candidate.name = $name
                      AND (candidate:Building OR candidate:DocentSpot)
                      AND NOT candidate:TourStop
                    RETURN elementId(candidate) AS id
                    ORDER BY CASE WHEN candidate:Building THEN 0 ELSE 1 END
                    LIMIT 1
                    """,
                    name=row["name"],
                ).single()
                target_id = candidate["id"] if candidate else None

            if target_id is None:
                session.run(
                    """
                    CREATE (stop:TourStop:Place)
                    SET stop.place_id = $place_id,
                        stop.name = $name,
                        stop.order = $order,
                        stop.latitude = $latitude,
                        stop.longitude = $longitude,
                        stop.tour_latitude = $latitude,
                        stop.tour_longitude = $longitude,
                        stop.tour_source = 'campus_places.csv'
                    """,
                    **row,
                ).consume()
            else:
                session.run(
                    """
                    MATCH (stop) WHERE elementId(stop) = $target_id
                    SET stop:TourStop:Place,
                        stop.place_id = $place_id,
                        stop.name = $name,
                        stop.order = $order,
                        stop.tour_latitude = $latitude,
                        stop.tour_longitude = $longitude,
                        stop.tour_source = 'campus_places.csv'
                    """,
                    target_id=target_id,
                    **row,
                ).consume()

    run(driver, "MATCH (:TourStop)-[route:NEXT_STOP]->(:TourStop) DELETE route")
    run(
        driver,
        """
        MATCH (first:TourStop), (second:TourStop)
        WHERE second.order = first.order + 1
        MERGE (first)-[:NEXT_STOP]->(second)
        """,
    )
    run(
        driver,
        """
        MATCH (spot:DocentSpot {source: 'campus_places.csv'})
        OPTIONAL MATCH (old_parent)-[old:HAS_PLACE]->(spot)
        WHERE old_parent:Building OR old_parent:TourStop
        DELETE old
        WITH DISTINCT spot
        MATCH (parent {name: spot.nearby_area})
        WHERE parent:Building OR parent:TourStop
        MERGE (parent)-[:HAS_PLACE]->(spot)
        """,
    )
    return len(batch)


def load_floors(driver) -> int:
    source_rows = read_csv("nodes_floor.csv")
    by_name, by_code = building_name_lookup()
    rows = []
    for row in source_rows:
        canonical_name = canonical_building_name(row, by_name, by_code)
        if canonical_name:
            rows.append({**row, "building_name": canonical_name})
    skipped = len(source_rows) - len(rows)
    if skipped:
        print(f"Skipped {skipped} floors without a canonical nodes_building.csv match")
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (floor:Floor {building_name: row.building_name, floor: row.floor})
        SET floor.floor_id = row.id,
            floor.building_code = CASE WHEN row.building_code = '' THEN null ELSE row.building_code END,
            floor.source = 'campus_interiors.csv'
        WITH row, floor
        MATCH (building:Building {name: row.building_name})
        MERGE (building)-[:HAS_FLOOR]->(floor)
        """,
        batch=rows,
    )
    return len(rows)


def load_rooms(driver) -> int:
    source_rows = read_csv("nodes_room.csv")
    floor_rows = read_csv("nodes_floor.csv")
    by_name, by_code = building_name_lookup()
    valid_floors = {
        (canonical_name, row["floor"])
        for row in floor_rows
        if (canonical_name := canonical_building_name(row, by_name, by_code))
    }
    rows = []
    for row in source_rows:
        canonical_name = canonical_building_name(row, by_name, by_code)
        if canonical_name and (canonical_name, row["floor"]) in valid_floors:
            room_name = row["name"]
            rows.append({
                **row,
                "building_name": canonical_name,
                "is_facility": (
                    room_name.endswith(FACILITY_ROOM_SUFFIXES)
                    and "·" not in room_name
                    and "~" not in room_name
                    and "미화원" not in room_name
                ),
            })
    skipped = len(source_rows) - len(rows)
    if skipped:
        print(f"Skipped {skipped} rooms without a canonical floor match")
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (room:Room {
            building_name: row.building_name,
            floor: row.floor,
            room_no: row.room_no,
            name: row.name
        })
        SET room.room_id = row.id,
            room.building_code = CASE WHEN row.building_code = '' THEN null ELSE row.building_code END,
            room.type = row.type,
            room.source = 'campus_interiors.csv'
        FOREACH (_ IN CASE WHEN row.is_facility THEN [1] ELSE [] END |
            SET room:Facility,
                room.facility_label_source = 'campus_interiors.csv'
        )
        WITH row, room
        MATCH (floor:Floor {building_name: row.building_name, floor: row.floor})
        MERGE (floor)-[:HAS_ROOM]->(room)
        """,
        batch=rows,
    )
    return len(rows)


def load_facilities(driver) -> int:
    rows = read_csv("nodes_facility.csv")
    floor_rows = read_csv("nodes_floor.csv")
    by_name, by_code = building_name_lookup()
    valid_floors = {
        (canonical_name, row["floor"])
        for row in floor_rows
        if (canonical_name := canonical_building_name(row, by_name, by_code))
    }
    batch = []
    for row in rows:
        canonical_name = canonical_building_name(row, by_name, by_code)
        if canonical_name and (canonical_name, row["floor"]) in valid_floors:
            batch.append({
                "facility_id": row["id"],
                "building_name": canonical_name,
                "building_code": row.get("building_code", "") or None,
                "floor": row["floor"],
                "name": row["name"],
                "type": row.get("category", ""),
                "features": row.get("features", ""),
                "note": row.get("note", ""),
            })
    if len(batch) != len(rows):
        raise ValueError(
            f"Facilities need canonical building/floor mappings: {len(rows) - len(batch)} missing"
        )
    run(
        driver,
        """
        MATCH (facility:Facility {source: 'integrated_facilities.csv'})
        WHERE NOT facility.facility_id IN $facility_ids
        DETACH DELETE facility
        """,
        facility_ids=[row["facility_id"] for row in batch],
    )
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (facility:Facility {facility_id: row.facility_id})
        SET facility.name = row.name,
            facility.type = row.type,
            facility.features = row.features,
            facility.note = row.note,
            facility.building_name = row.building_name,
            facility.building_code = row.building_code,
            facility.floor = row.floor,
            facility.source = 'integrated_facilities.csv'
        WITH row, facility
        MATCH (floor:Floor {building_name: row.building_name, floor: row.floor})
        MERGE (floor)-[:HAS_FACILITY]->(facility)
        WITH row, facility
        MATCH (building:Building {name: row.building_name})
        MERGE (facility)-[:LOCATED_IN]->(building)
        """,
        batch=batch,
    )
    run(
        driver,
        """
        MATCH (building:Building)
        OPTIONAL MATCH (building)<-[:LOCATED_IN]-(facility:Facility {source: 'integrated_facilities.csv'})
        WITH building, count(facility) AS facility_count,
             [value IN collect(DISTINCT facility.name) WHERE value IS NOT NULL] AS facility_names,
             [value IN collect(DISTINCT facility.type) WHERE value IS NOT NULL] AS facility_types,
             [value IN collect(DISTINCT facility.floor) WHERE value IS NOT NULL] AS facility_floors
        SET building.facility_count = facility_count,
            building.facility_names = facility_names,
            building.facility_types = facility_types,
            building.facility_floors = facility_floors,
            building.facility_data_source = CASE
                WHEN facility_count > 0 THEN 'integrated_facilities.csv'
                ELSE null
            END
        """,
    )
    return len(batch)


def load_stores(driver) -> int:
    rows = read_csv("nodes_store.csv")
    batch = [
        {
            "store_id": row["id"],
            **row,
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
            "building_name": row.get("building_name", ""),
        }
        for row in rows
        if row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (store:Store:Facility {name: row.name})
        SET store.store_id = row.store_id,
            store.no = row.no,
            store.location = row.location,
            store.type = row.type,
            store.hours = row.hours,
            store.restriction = row.restriction,
            store.phone = row.phone,
            store.note = row.note,
            store.latitude = row.latitude,
            store.longitude = row.longitude,
            store.coordinate_source = row.coordinate_source,
            store.source = 'campus_places.csv',
            store.facility_label_source = 'campus_places.csv'
        WITH row, store
        OPTIONAL MATCH (:Building)-[old:HAS_STORE]->(store)
        DELETE old
        WITH DISTINCT row, store
        OPTIONAL MATCH (building:Building {name: row.building_name})
        FOREACH (_ IN CASE WHEN building IS NULL THEN [] ELSE [1] END |
            MERGE (building)-[:HAS_STORE]->(store)
        )
        """,
        batch=batch,
    )
    return len(batch)


def load_docent_spots(driver) -> int:
    rows = read_csv("nodes_docent_spot.csv")
    batch = [
        {
            **row,
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
        }
        for row in rows
        if row["spot_id"] and row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (spot:DocentSpot:Place {spot_id: row.spot_id})
        SET spot.name = row.name,
            spot.type = row.type,
            spot.spot_type = row.spot_type,
            spot.nearby_area = row.nearby_area,
            spot.campus = row.campus,
            spot.description = row.description,
            spot.docent_text = row.docent_text,
            spot.latitude = row.latitude,
            spot.longitude = row.longitude,
            spot.coordinate_source = row.coordinate_source,
            spot.source_url = row.source_url,
            spot.note = row.note,
            spot.source = 'campus_places.csv'
        """,
        batch=batch,
    )
    return len(batch)


ENTITY_MATCH = """
MATCH (entity)
WHERE entity.place_id = row.entity_id
   OR entity.spot_id = row.entity_id
   OR entity.building_id = row.entity_id
   OR entity.store_id = row.entity_id
   OR entity.floor_id = row.entity_id
   OR entity.room_id = row.entity_id
   OR entity.facility_id = row.entity_id
"""


def load_facts(driver) -> int:
    rows = [
        {
            **row,
            "importance": int(row["importance"]),
            "verified": parse_bool(row["verified"]),
        }
        for row in read_content_csv(CANONICAL_FACTS)
    ]
    run(
        driver,
        "MATCH (fact:Fact {source: 'campus_facts.csv'}) "
        "WHERE NOT fact.fact_id IN $fact_ids DETACH DELETE fact",
        fact_ids=[row["fact_id"] for row in rows],
    )
    run(
        driver,
        f"""
        UNWIND $batch AS row
        MERGE (fact:Fact {{fact_id: row.fact_id}})
        SET fact.category = row.category,
            fact.content = row.content,
            fact.importance = row.importance,
            fact.verified = row.verified,
            fact.source_url = CASE WHEN row.source_url = '' THEN null ELSE row.source_url END,
            fact.source = 'campus_facts.csv'
        WITH row, fact
        OPTIONAL MATCH ()-[old_owner:HAS_FACT]->(fact)
        DELETE old_owner
        WITH DISTINCT row, fact
        {ENTITY_MATCH}
        MERGE (entity)-[:HAS_FACT]->(fact)
        """,
        batch=rows,
    )
    return len(rows)


def load_docent_configs(driver) -> int:
    source_rows = read_content_csv(CANONICAL_DOCENTS)
    rows = [
        {
            **row,
            "enabled": parse_bool(row["enabled"]),
            "target_duration_seconds": int(row["target_duration_seconds"]),
            "required_fact_ids": split_ids(row["required_fact_ids"]),
            "optional_fact_ids": split_ids(row["optional_fact_ids"]),
        }
        for row in source_rows
    ]
    run(
        driver,
        "MATCH (config:DocentConfig {source: 'campus_docents.csv'}) "
        "WHERE NOT config.entity_id IN $entity_ids DETACH DELETE config",
        entity_ids=[row["entity_id"] for row in rows],
    )
    run(
        driver,
        f"""
        UNWIND $batch AS row
        MERGE (config:DocentConfig {{entity_id: row.entity_id}})
        SET config.enabled = row.enabled,
            config.opening_line = CASE WHEN row.opening_line = '' THEN null ELSE row.opening_line END,
            config.target_duration_seconds = row.target_duration_seconds,
            config.source = 'campus_docents.csv'
        WITH row, config
        OPTIONAL MATCH ()-[old_owner:HAS_DOCENT_CONFIG]->(config)
        DELETE old_owner
        WITH DISTINCT row, config
        {ENTITY_MATCH}
        MERGE (entity)-[:HAS_DOCENT_CONFIG]->(config)
        WITH row, config
        OPTIONAL MATCH (config)-[old:REQUIRES_FACT|OPTIONALLY_USES_FACT]->(:Fact)
        DELETE old
        WITH DISTINCT row, config
        UNWIND row.required_fact_ids AS fact_id
        MATCH (fact:Fact {{fact_id: fact_id}})
        MERGE (config)-[:REQUIRES_FACT]->(fact)
        """,
        batch=rows,
    )
    run(
        driver,
        """
        UNWIND $batch AS row
        MATCH (config:DocentConfig {entity_id: row.entity_id})
        UNWIND row.optional_fact_ids AS fact_id
        MATCH (fact:Fact {fact_id: fact_id})
        MERGE (config)-[:OPTIONALLY_USES_FACT]->(fact)
        """,
        batch=rows,
    )
    return len(rows)


def load_guide_purposes(driver) -> int:
    with (DATA_DIR / "guide_purposes.json").open("r", encoding="utf-8") as file:
        rules = json.load(file)
    rows = [
        {"id": purpose, "keywords": [keyword.lower() for keyword in keywords]}
        for purpose, keywords in rules.items()
    ]
    run(
        driver,
        "MATCH ()-[relation:SERVES_PURPOSE {source: 'guide_purposes.json'}]->() DELETE relation",
    )
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (purpose:Purpose {purpose_id: row.id})
        SET purpose.name = row.id, purpose.source = 'guide_purposes.json'
        WITH row, purpose
        MATCH (content)
        WHERE content:Facility OR content:Fact OR content:Place
        WITH row, purpose, content,
             toLower(
                coalesce(content.name, '') + ' ' + coalesce(content.type, '') + ' ' +
                coalesce(content.features, '') + ' ' + coalesce(content.note, '') + ' ' +
                coalesce(content.description, '') + ' ' + coalesce(content.content, '')
             ) AS searchable
        WHERE any(keyword IN row.keywords WHERE searchable CONTAINS keyword)
        MERGE (content)-[relation:SERVES_PURPOSE]->(purpose)
        SET relation.source = 'guide_purposes.json'
        """,
        batch=rows,
    )
    return len(rows)


def load_campus_relations(driver) -> int:
    run(
        driver,
        """
        MERGE (campus:Campus {campus_id: 'jbnu-jeonju'})
        SET campus.name = '전북대학교 전주캠퍼스',
            campus.source = 'neo4j_loader_v2.py'
        WITH campus
        MATCH (node)
        WHERE node:Building OR node:Facility OR node:TourStop OR node:DocentSpot OR node:Parking
        MERGE (node)-[:PART_OF_CAMPUS]->(campus)
        """,
    )
    relations = build_near_relations()
    near_relations = [row for row in relations if row["relation_type"] == "NEAR"]
    semi_near_relations = [row for row in relations if row["relation_type"] == "SEMI_NEAR"]
    run(
        driver,
        """
        MATCH ()-[relation:NEAR|SEMI_NEAR]->()
        WHERE relation.kind = 'physical_walk'
           OR relation.method IN ['nearest_canonical_building', 'tour_destination_radius_200m']
        DELETE relation
        """,
    )
    run(
        driver,
        """
        UNWIND $batch AS row
        CALL {
            WITH row
            MATCH (entity)
            WHERE entity.place_id = row.from_id
               OR entity.spot_id = row.from_id
               OR entity.building_id = row.from_id
               OR entity.store_id = row.from_id
               OR entity.facility_id = row.from_id
            RETURN entity AS first
            ORDER BY elementId(entity)
            LIMIT 1
        }
        CALL {
            WITH row
            MATCH (entity)
            WHERE entity.place_id = row.to_id
               OR entity.spot_id = row.to_id
               OR entity.building_id = row.to_id
               OR entity.store_id = row.to_id
               OR entity.facility_id = row.to_id
            RETURN entity AS second
            ORDER BY elementId(entity)
            LIMIT 1
        }
        WITH row,
             CASE WHEN elementId(first) < elementId(second) THEN first ELSE second END AS first,
             CASE WHEN elementId(first) < elementId(second) THEN second ELSE first END AS second
        WHERE first <> second
        MERGE (first)-[near:NEAR]->(second)
        SET near.kind = row.kind,
            near.distance_m = row.distance_m,
            near.walking_seconds = row.walking_seconds,
            near.method = row.method,
            near.source = row.source,
            near.verified = row.verified,
            near.note = CASE WHEN row.note = '' THEN null ELSE row.note END
        """,
        batch=near_relations,
    )
    run(
        driver,
        """
        UNWIND $batch AS row
        CALL {
            WITH row
            MATCH (entity)
            WHERE entity.place_id = row.from_id OR entity.spot_id = row.from_id
               OR entity.building_id = row.from_id OR entity.store_id = row.from_id
               OR entity.facility_id = row.from_id
            RETURN entity AS first ORDER BY elementId(entity) LIMIT 1
        }
        CALL {
            WITH row
            MATCH (entity)
            WHERE entity.place_id = row.to_id OR entity.spot_id = row.to_id
               OR entity.building_id = row.to_id OR entity.store_id = row.to_id
               OR entity.facility_id = row.to_id
            RETURN entity AS second ORDER BY elementId(entity) LIMIT 1
        }
        WITH row,
             CASE WHEN elementId(first) < elementId(second) THEN first ELSE second END AS first,
             CASE WHEN elementId(first) < elementId(second) THEN second ELSE first END AS second
        WHERE first <> second
        MERGE (first)-[relation:SEMI_NEAR]->(second)
        SET relation.kind = row.kind, relation.distance_m = row.distance_m,
            relation.walking_seconds = row.walking_seconds, relation.method = row.method,
            relation.source = row.source, relation.verified = row.verified,
            relation.note = CASE WHEN row.note = '' THEN null ELSE row.note END
        """,
        batch=semi_near_relations,
    )
    return len(relations)


def verify(driver) -> None:
    with driver.session() as session:
        counts = session.run(
            """
            MATCH (building:Building)
            WITH count(building) AS buildings,
                 count(CASE WHEN building.latitude IS NOT NULL AND building.longitude IS NOT NULL THEN 1 END) AS buildings_with_coordinates
            MATCH (stop:TourStop)
            WITH buildings, buildings_with_coordinates, count(stop) AS tour_stops,
                 count(CASE WHEN stop.tour_latitude IS NOT NULL AND stop.tour_longitude IS NOT NULL THEN 1 END) AS tour_stops_with_coordinates
            MATCH (floor:Floor)
            WITH buildings, buildings_with_coordinates, tour_stops, tour_stops_with_coordinates, count(floor) AS floors
            MATCH (room:Room)
            WITH buildings, buildings_with_coordinates, tour_stops, tour_stops_with_coordinates, floors, count(room) AS rooms
            MATCH (store:Store)
            RETURN buildings, buildings_with_coordinates, tour_stops,
                   tour_stops_with_coordinates, floors, rooms, count(store) AS stores
            """
        ).single()

        dangling_floors = session.run(
            "MATCH (floor:Floor {source: 'campus_interiors.csv'}) WHERE NOT (:Building)-[:HAS_FLOOR]->(floor) RETURN count(floor) AS count"
        ).single()["count"]
        dangling_rooms = session.run(
            "MATCH (room:Room {source: 'campus_interiors.csv'}) WHERE NOT (:Floor)-[:HAS_ROOM]->(room) RETURN count(room) AS count"
        ).single()["count"]
        dangling_facilities = session.run(
            "MATCH (facility:Facility {source: 'integrated_facilities.csv'}) "
            "WHERE NOT (:Floor)-[:HAS_FACILITY]->(facility) "
            "OR NOT (facility)-[:LOCATED_IN]->(:Building) "
            "RETURN count(facility) AS count"
        ).single()["count"]
        unlinked_stores = session.run(
            "MATCH (store:Store {source: 'campus_places.csv'}) WHERE NOT (:Building)-[:HAS_STORE]->(store) RETURN count(store) AS count"
        ).single()["count"]
        ambiguous_stores = session.run(
            "MATCH (building:Building)-[:HAS_STORE]->(store:Store {source: 'campus_places.csv'}) "
            "WITH store, count(DISTINCT building) AS buildings WHERE buildings <> 1 RETURN count(store) AS count"
        ).single()["count"]
        dangling_facts = session.run(
            "MATCH (fact:Fact {source: 'campus_facts.csv'}) "
            "WHERE NOT ()-[:HAS_FACT]->(fact) RETURN count(fact) AS count"
        ).single()["count"]
        invalid_docent_fact_links = session.run(
            "MATCH (entity)-[:HAS_DOCENT_CONFIG]->(config:DocentConfig)"
            "-[:REQUIRES_FACT|OPTIONALLY_USES_FACT]->(fact:Fact) "
            "WHERE NOT (entity)-[:HAS_FACT]->(fact) RETURN count(DISTINCT fact) AS count"
        ).single()["count"]
        near_counts = session.run(
            """
            MATCH ()-[near:NEAR {kind: 'physical_walk'}]->()
            RETURN count(near) AS total,
                   count(CASE WHEN near.source IN ['generated', 'manual']
                                   AND near.method IN ['walking_network', 'straight_line_fallback', 'manual']
                                   AND near.walking_seconds IS NOT NULL
                              THEN 1 END) AS valid
            """
        ).single()
        semi_near_counts = session.run(
            """
            MATCH ()-[relation:SEMI_NEAR {kind: 'physical_walk'}]->()
            RETURN count(relation) AS total,
                   count(CASE WHEN relation.distance_m > 80 AND relation.distance_m <= 350
                                   AND relation.walking_seconds IS NOT NULL
                              THEN 1 END) AS valid
            """
        ).single()

    result = dict(counts) if counts else {}
    result.update({
        "dangling_floors": dangling_floors,
        "dangling_rooms": dangling_rooms,
        "dangling_facilities": dangling_facilities,
        "unlinked_stores": unlinked_stores,
        "ambiguous_stores": ambiguous_stores,
        "dangling_facts": dangling_facts,
        "invalid_docent_fact_links": invalid_docent_fact_links,
        "physical_near_relations": near_counts["total"],
        "invalid_physical_near_relations": near_counts["total"] - near_counts["valid"],
        "physical_semi_near_relations": semi_near_counts["total"],
        "invalid_physical_semi_near_relations": semi_near_counts["total"] - semi_near_counts["valid"],
    })
    print(f"Verification: {result}")
    if result.get("tour_stops") != 12 or result.get("tour_stops_with_coordinates") != 12:
        raise RuntimeError("All 12 tour stops must have coordinates")
    if dangling_floors or dangling_rooms or dangling_facilities:
        raise RuntimeError("CSV relationships contain dangling nodes")
    if unlinked_stores or ambiguous_stores:
        raise RuntimeError("Every CSV store must be linked to exactly one building")
    if dangling_facts or invalid_docent_fact_links:
        raise RuntimeError("Every docent fact must be linked to its configured entity")
    if not result["physical_near_relations"] or result["invalid_physical_near_relations"]:
        raise RuntimeError("Physical NEAR relationships are missing or invalid")
    if not result["physical_semi_near_relations"] or result["invalid_physical_semi_near_relations"]:
        raise RuntimeError("Physical SEMI_NEAR relationships are missing or invalid")


def load_all(driver, reset: bool) -> None:
    validate_source_data()
    if reset:
        print("Resetting the Neo4j database...")
        run(driver, "MATCH (node) DETACH DELETE node")

    create_indexes(driver)
    loaders = (
        ("buildings", load_buildings),
        ("parkings", load_parkings),
        ("floors", load_floors),
        ("rooms", load_rooms),
        ("facilities", load_facilities),
        ("stores", load_stores),
        ("docent spots", load_docent_spots),
        ("tour stops", load_tour_stops),
        ("facts", load_facts),
        ("docent configs", load_docent_configs),
        ("guide purposes", load_guide_purposes),
        ("campus relation set", load_campus_relations),
    )
    for label, loader in loaders:
        print(f"Loaded {loader(driver)} {label}")
    verify(driver)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete the existing graph before loading the current CSV files.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        for attempt in range(1, 6):
            try:
                driver.verify_connectivity()
                break
            except Exception:
                if attempt == 5:
                    raise
                time.sleep(3)
        load_all(driver, reset=arguments.reset)
    finally:
        driver.close()
