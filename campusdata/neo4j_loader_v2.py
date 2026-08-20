"""Load the current campus CSV files into Neo4j.

The loader is idempotent by default. Pass ``--reset`` only when a full graph
rebuild is explicitly required.
"""

from __future__ import annotations

import argparse
import csv
import os
import time
from pathlib import Path
from typing import Any, Iterable

from neo4j import GraphDatabase


NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")
DATA_DIR = Path(__file__).resolve().parent


def read_csv(filename: str) -> list[dict[str, str]]:
    path = DATA_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required CSV is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [
            {str(key).strip(): (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(file)
        ]


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
    route = read_csv("tour_route.csv")

    building_names = [row["name"] for row in buildings if row["name"]]
    ensure_unique(building_names, "building names")

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


def create_indexes(driver) -> None:
    queries = (
        "CREATE INDEX building_name IF NOT EXISTS FOR (n:Building) ON (n.name)",
        "CREATE CONSTRAINT tour_stop_id IF NOT EXISTS FOR (n:TourStop) REQUIRE n.place_id IS UNIQUE",
        "CREATE CONSTRAINT docent_spot_id IF NOT EXISTS FOR (n:DocentSpot) REQUIRE n.spot_id IS UNIQUE",
        "CREATE INDEX store_name IF NOT EXISTS FOR (n:Store) ON (n.name)",
        "CREATE INDEX floor_building IF NOT EXISTS FOR (n:Floor) ON (n.building_name)",
        "CREATE INDEX room_building IF NOT EXISTS FOR (n:Room) ON (n.building_name)",
    )
    for query in queries:
        run(driver, query)


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
            "code": row["code"] or None,
            "name": row["name"],
            "main_function": row["main_function"],
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
            "coordinate_source": row["coordinate_source"],
            "source_url": row["source_url"],
            "related_content": row["related_content"],
        }
        for row in rows
        if row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (building:Building {name: row.name})
        SET building.code = row.code,
            building.main_function = row.main_function,
            building.latitude = row.latitude,
            building.longitude = row.longitude,
            building.coordinate_source = row.coordinate_source,
            building.source_url = row.source_url,
            building.related_content = row.related_content,
            building.source = 'nodes_building.csv'
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
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (stop:TourStop:Place {place_id: row.place_id})
        SET stop.order = row.order,
            stop.name = row.name,
            stop.latitude = row.latitude,
            stop.longitude = row.longitude,
            stop.source = 'tour_route.csv'
        """,
        batch=batch,
    )
    run(
        driver,
        """
        MATCH (first:TourStop), (second:TourStop)
        WHERE second.order = first.order + 1
        MERGE (first)-[:NEXT_STOP]->(second)
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
        SET floor.building_code = CASE WHEN row.building_code = '' THEN null ELSE row.building_code END,
            floor.source = 'nodes_floor.csv'
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
            rows.append({**row, "building_name": canonical_name})
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
        SET room.building_code = CASE WHEN row.building_code = '' THEN null ELSE row.building_code END,
            room.type = row.type,
            room.source = 'nodes_room.csv'
        WITH row, room
        MATCH (floor:Floor {building_name: row.building_name, floor: row.floor})
        MERGE (floor)-[:HAS_ROOM]->(room)
        """,
        batch=rows,
    )
    return len(rows)


def load_stores(driver) -> int:
    rows = read_csv("nodes_store.csv")
    batch = [
        {
            **row,
            "latitude": optional_float(row["latitude"]),
            "longitude": optional_float(row["longitude"]),
        }
        for row in rows
        if row["name"]
    ]
    run(
        driver,
        """
        UNWIND $batch AS row
        MERGE (store:Store {name: row.name})
        SET store.no = row.no,
            store.location = row.location,
            store.type = row.type,
            store.hours = row.hours,
            store.restriction = row.restriction,
            store.phone = row.phone,
            store.note = row.note,
            store.latitude = row.latitude,
            store.longitude = row.longitude,
            store.coordinate_source = row.coordinate_source,
            store.source = 'nodes_store.csv'
        WITH row, store
        OPTIONAL MATCH (building:Building)
        WHERE row.location CONTAINS building.name OR building.name CONTAINS row.location
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
            spot.source = 'nodes_docent_spot.csv'
        """,
        batch=batch,
    )
    return len(batch)


def verify(driver) -> None:
    with driver.session() as session:
        counts = session.run(
            """
            MATCH (building:Building)
            WITH count(building) AS buildings,
                 count(CASE WHEN building.latitude IS NOT NULL AND building.longitude IS NOT NULL THEN 1 END) AS buildings_with_coordinates
            MATCH (stop:TourStop)
            WITH buildings, buildings_with_coordinates, count(stop) AS tour_stops,
                 count(CASE WHEN stop.latitude IS NOT NULL AND stop.longitude IS NOT NULL THEN 1 END) AS tour_stops_with_coordinates
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
            "MATCH (floor:Floor {source: 'nodes_floor.csv'}) WHERE NOT (:Building)-[:HAS_FLOOR]->(floor) RETURN count(floor) AS count"
        ).single()["count"]
        dangling_rooms = session.run(
            "MATCH (room:Room {source: 'nodes_room.csv'}) WHERE NOT (:Floor)-[:HAS_ROOM]->(room) RETURN count(room) AS count"
        ).single()["count"]

    result = dict(counts) if counts else {}
    result.update({"dangling_floors": dangling_floors, "dangling_rooms": dangling_rooms})
    print(f"Verification: {result}")
    if result.get("tour_stops") != 12 or result.get("tour_stops_with_coordinates") != 12:
        raise RuntimeError("All 12 tour stops must have coordinates")
    if dangling_floors or dangling_rooms:
        raise RuntimeError("CSV relationships contain dangling nodes")


def load_all(driver, reset: bool) -> None:
    validate_source_data()
    if reset:
        print("Resetting the Neo4j database...")
        run(driver, "MATCH (node) DETACH DELETE node")

    create_indexes(driver)
    loaders = (
        ("buildings", load_buildings),
        ("tour stops", load_tour_stops),
        ("floors", load_floors),
        ("rooms", load_rooms),
        ("stores", load_stores),
        ("docent spots", load_docent_spots),
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
