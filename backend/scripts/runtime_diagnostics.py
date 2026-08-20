#!/usr/bin/env python3
"""Print deployment diagnostics without exposing environment variable values."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import platform
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from neo4j import GraphDatabase


DATA_DIR = Path(os.getenv("CAMPUS_DATA_DIR", "/campusdata"))
BACKEND_URL = os.getenv("DIAGNOSTICS_BACKEND_URL", "http://127.0.0.1:8000")
CHECKED_ENVIRONMENT_KEYS = (
    "NEO4J_URI",
    "NEO4J_USER",
    "NEO4J_PASSWORD",
    "GOOGLE_API_KEY",
    "NAVER_MAP_CLIENT_ID",
    "NAVER_MAP_CLIENT_SECRET",
)
CHECKED_DATA_FILES = (
    "tour_route.csv",
    "jbnu_walking_path.geojson",
    "nodes_building.csv",
    "nodes_docent_spot.csv",
    "nodes_floor.csv",
    "nodes_room.csv",
    "nodes_store.csv",
    "neo4j_loader_v2.py",
)


def emit(section: str, payload: Any) -> None:
    print(
        "DIAGNOSTIC "
        + json.dumps(
            {"section": section, "payload": payload},
            ensure_ascii=False,
            sort_keys=True,
        ),
        flush=True,
    )


def file_diagnostics() -> dict[str, Any]:
    result: dict[str, Any] = {}
    for filename in CHECKED_DATA_FILES:
        path = DATA_DIR / filename
        if not path.is_file():
            result[filename] = {"exists": False}
            continue

        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)

        result[filename] = {
            "exists": True,
            "bytes": path.stat().st_size,
            "sha256": digest.hexdigest(),
        }
    return result


def read_route_stops() -> list[dict[str, Any]]:
    route_path = DATA_DIR / "tour_route.csv"
    if not route_path.is_file():
        return []

    stops = []
    with route_path.open("r", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            try:
                stops.append(
                    {
                        "order": int(row["order"]),
                        "place_id": row["place_id"].strip(),
                        "name": row["name"].strip(),
                        "latitude": float(row["latitude"]),
                        "longitude": float(row["longitude"]),
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue
    return sorted(stops, key=lambda stop: stop["order"])


def source_data_diagnostics(route_stops: list[dict[str, Any]]) -> dict[str, Any]:
    building_path = DATA_DIR / "nodes_building.csv"
    building_rows = 0
    building_rows_with_coordinates = 0
    if building_path.is_file():
        with building_path.open("r", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                building_rows += 1
                try:
                    float(row["latitude"])
                    float(row["longitude"])
                    building_rows_with_coordinates += 1
                except (KeyError, TypeError, ValueError):
                    pass

    return {
        "nodes_building_rows": building_rows,
        "nodes_building_rows_with_coordinates": building_rows_with_coordinates,
        "tour_route_rows": len(route_stops),
        "tour_route_unique_place_ids": len({stop["place_id"] for stop in route_stops}),
        "tour_route_unique_coordinates": len(
            {(stop["latitude"], stop["longitude"]) for stop in route_stops}
        ),
        "csv_loader_prerequisites_complete": all(
            (DATA_DIR / filename).is_file() for filename in CHECKED_DATA_FILES
        ),
    }


def neo4j_diagnostics(route_stops: list[dict[str, Any]]) -> dict[str, Any]:
    uri = os.getenv("NEO4J_URI", "")
    user = os.getenv("NEO4J_USER", "")
    password = os.getenv("NEO4J_PASSWORD", "")
    if not all((uri, user, password)):
        return {"connected": False, "error": "Neo4j environment is incomplete"}

    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        with driver.session() as session:
            building_counts = session.run(
                """
                MATCH (b:Building)
                RETURN count(b) AS total,
                       count(CASE WHEN b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN 1 END) AS with_coordinates
                """
            ).single()
            tour_counts = session.run(
                """
                MATCH (stop:TourStop)
                RETURN count(stop) AS total,
                       count(CASE WHEN stop.latitude IS NOT NULL AND stop.longitude IS NOT NULL THEN 1 END) AS with_coordinates
                """
            ).single()
            actual_ids = {
                row["place_id"]
                for row in session.run(
                    "MATCH (stop:TourStop) WHERE stop.place_id IN $ids RETURN stop.place_id AS place_id",
                    {"ids": [stop["place_id"] for stop in route_stops]},
                )
            }

        expected_ids = [stop["place_id"] for stop in route_stops]
        return {
            "connected": True,
            "buildings": building_counts["total"] if building_counts else 0,
            "buildings_with_coordinates": building_counts["with_coordinates"] if building_counts else 0,
            "tour_stops": tour_counts["total"] if tour_counts else 0,
            "tour_stops_with_coordinates": tour_counts["with_coordinates"] if tour_counts else 0,
            "route_ids_loaded": len(actual_ids),
            "route_ids_missing": [place_id for place_id in expected_ids if place_id not in actual_ids],
        }
    except Exception as error:
        return {
            "connected": False,
            "error_type": type(error).__name__,
            "error": str(error),
        }
    finally:
        driver.close()


def post_json(path: str, body: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        f"{BACKEND_URL}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=45) as response:
        return json.load(response)


def coordinate_key(point: dict[str, Any]) -> tuple[float, float]:
    return (round(float(point["x"]), 7), round(float(point["y"]), 7))


def route_diagnostics(expected_stops: list[dict[str, Any]]) -> dict[str, Any]:
    started_at = time.monotonic()
    try:
        response = post_json("/tour/init", {"language": "ko"})
        data = response.get("data", {})
        stops = data.get("stops", [])
        segments = data.get("routeSegments", [])
        coordinates = [coordinate_key(stop["mapPoint"]) for stop in stops]
        expected_coordinates = [
            (round(stop["longitude"], 7), round(stop["latitude"], 7))
            for stop in expected_stops
        ]
        segment_point_counts = [len(segment.get("points", [])) for segment in segments]
        degenerate_segments = [
            f"{segment.get('fromStopId')}->{segment.get('toStopId')}"
            for segment in segments
            if len(
                {
                    coordinate_key(point)
                    for point in segment.get("points", [])
                    if "x" in point and "y" in point
                }
            ) <= 1
        ]
        result = {
            "status": "ok",
            "elapsed_ms": round((time.monotonic() - started_at) * 1000),
            "stops": len(stops),
            "segments": len(segments),
            "stop_order_matches_csv": [stop.get("id") for stop in stops]
            == [stop["place_id"] for stop in expected_stops],
            "coordinates_match_csv": coordinates == expected_coordinates,
            "unique_stop_coordinates": len(set(coordinates)),
            "degenerate_segments": degenerate_segments,
            "min_segment_points": min(segment_point_counts, default=0),
            "max_segment_points": max(segment_point_counts, default=0),
        }
    except HTTPError as error:
        result = {
            "status": "http_error",
            "http_status": error.code,
            "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        }
    except (URLError, TimeoutError, ValueError, KeyError) as error:
        result = {
            "status": "error",
            "error_type": type(error).__name__,
            "error": str(error),
            "elapsed_ms": round((time.monotonic() - started_at) * 1000),
        }
    return result


def main() -> None:
    route_stops = read_route_stops()
    emit(
        "runtime",
        {
            "diagnostics_version": 2,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "working_directory": os.getcwd(),
            "data_directory": str(DATA_DIR),
        },
    )
    emit(
        "environment_presence",
        {key: bool(os.getenv(key)) for key in CHECKED_ENVIRONMENT_KEYS},
    )
    emit("data_files", file_diagnostics())
    emit("source_data", source_data_diagnostics(route_stops))
    emit("neo4j", neo4j_diagnostics(route_stops))
    emit("tour_route", route_diagnostics(route_stops))


if __name__ == "__main__":
    main()
