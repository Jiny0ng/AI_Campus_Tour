"""Build physical NEAR relationships from canonical places and walking paths."""

from __future__ import annotations

import csv
import heapq
import json
import math
from pathlib import Path
from typing import Iterable

DATA_DIR = Path(__file__).resolve().parent
WALKING_SPEED_MPS = 1.3
NEAR_SECONDS = 60
FALLBACK_RADIUS_M = 80.0
NEAR_MAX_DISTANCE_M = 80.0
SEMI_NEAR_MAX_DISTANCE_M = 350.0
MAX_SNAP_DISTANCE_M = 40.0
MAX_SEGMENT_LENGTH_M = 5.0
ELIGIBLE_TYPES = {"building", "parking", "store", "docent_spot", "tour_stop"}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000.0
    lat_delta = math.radians(lat2 - lat1)
    lon_delta = math.radians(lon2 - lon1)
    value = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(lon_delta / 2) ** 2
    )
    return radius_m * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _edge_weight(properties: dict, distance_m: float) -> float:
    if properties.get("source_layer") == "public_road_centerline":
        return distance_m * 10.0
    highway = properties.get("highway")
    if highway in {"tertiary", "tertiary_link", "unclassified", "residential"}:
        return distance_m * 1.6
    if highway == "service":
        return distance_m * 1.4
    try:
        is_main = float(properties.get("RVWD", 0)) >= 4.0
    except (TypeError, ValueError):
        is_main = False
    if is_main or highway in {"pedestrian", "living_street"}:
        return distance_m * 0.9
    return distance_m


def load_walking_graph(path: Path | None = None) -> dict[tuple[float, float], dict]:
    source = path or DATA_DIR / "jbnu_walking_path.geojson"
    with source.open(encoding="utf-8") as file:
        geojson = json.load(file)
    graph: dict[tuple[float, float], dict[tuple[float, float], float]] = {}
    for feature in geojson.get("features", []):
        geometry = feature.get("geometry") or {}
        if geometry.get("type") != "LineString":
            continue
        coordinates = geometry.get("coordinates", [])
        properties = feature.get("properties") or {}
        for start, end in zip(coordinates, coordinates[1:]):
            first = (float(start[0]), float(start[1]))
            second = (float(end[0]), float(end[1]))
            physical_m = haversine(first[1], first[0], second[1], second[0])
            weight = _edge_weight(properties, physical_m)
            segment_count = max(1, math.ceil(physical_m / MAX_SEGMENT_LENGTH_M))
            points = [first]
            for index in range(1, segment_count):
                fraction = index / segment_count
                points.append((
                    first[0] + (second[0] - first[0]) * fraction,
                    first[1] + (second[1] - first[1]) * fraction,
                ))
            points.append(second)
            segment_weight = weight / segment_count
            for segment_start, segment_end in zip(points, points[1:]):
                current = graph.get(segment_start, {}).get(segment_end)
                if current is None or segment_weight < current:
                    graph.setdefault(segment_start, {})[segment_end] = segment_weight
                    graph.setdefault(segment_end, {})[segment_start] = segment_weight
    return graph


def _distances_within(graph: dict, source: tuple, cutoff: float) -> dict:
    distances = {source: 0.0}
    queue = [(0.0, source)]
    while queue:
        distance, node = heapq.heappop(queue)
        if distance != distances[node]:
            continue
        for neighbor, weight in graph.get(node, {}).items():
            candidate = distance + weight
            if candidate <= cutoff and candidate < distances.get(neighbor, math.inf):
                distances[neighbor] = candidate
                heapq.heappush(queue, (candidate, neighbor))
    return distances


def read_place_candidates(path: Path | None = None) -> list[dict]:
    source = path or DATA_DIR / "campus_places.csv"
    candidates = []
    with source.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file, skipinitialspace=True):
            if row.get("entity_type") not in ELIGIBLE_TYPES:
                continue
            try:
                latitude = float(row["latitude"])
                longitude = float(row["longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            candidates.append({
                "id": row["id"].strip(),
                "entity_type": row["entity_type"].strip(),
                "latitude": latitude,
                "longitude": longitude,
            })
    return candidates


def read_manual_overrides(path: Path | None = None) -> list[dict]:
    source = path or DATA_DIR / "campus_near_overrides.csv"
    if not source.is_file():
        return []
    with source.open(encoding="utf-8-sig", newline="") as file:
        return [
            {key: (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(file, skipinitialspace=True)
        ]


def _pair(first_id: str, second_id: str) -> tuple[str, str]:
    return tuple(sorted((first_id, second_id)))


def build_near_relations(
    candidates: Iterable[dict] | None = None,
    graph: dict | None = None,
    overrides: Iterable[dict] | None = None,
) -> list[dict]:
    places = list(candidates if candidates is not None else read_place_candidates())
    walking_graph = graph if graph is not None else load_walking_graph()
    manual = list(overrides if overrides is not None else read_manual_overrides())
    graph_nodes = list(walking_graph)
    snapped: dict[str, tuple[tuple[float, float], float] | None] = {}
    for place in places:
        nearest = min(
            graph_nodes,
            key=lambda node: haversine(
                place["latitude"], place["longitude"], node[1], node[0]
            ),
            default=None,
        )
        snap_m = (
            haversine(place["latitude"], place["longitude"], nearest[1], nearest[0])
            if nearest is not None else math.inf
        )
        snapped[place["id"]] = (
            (nearest, snap_m) if snap_m <= MAX_SNAP_DISTANCE_M else None
        )

    results: dict[tuple[str, str], dict] = {}
    path_lengths: dict[tuple[float, float], dict] = {}
    for index, first in enumerate(places):
        for second in places[index + 1:]:
            pair = _pair(first["id"], second["id"])
            straight_m = haversine(
                first["latitude"], first["longitude"],
                second["latitude"], second["longitude"],
            )
            first_snap = snapped[first["id"]]
            second_snap = snapped[second["id"]]
            method = "straight_line_fallback"
            distance_m = straight_m
            if first_snap is not None and second_snap is not None:
                if first_snap[0] not in path_lengths:
                    path_lengths[first_snap[0]] = _distances_within(
                        walking_graph, first_snap[0], cutoff=SEMI_NEAR_MAX_DISTANCE_M
                    )
                lengths = path_lengths[first_snap[0]]
                network_m = lengths.get(second_snap[0])
                if network_m is not None:
                    distance_m = first_snap[1] + network_m + second_snap[1]
                    method = "walking_network"
            relation_type = (
                "NEAR" if distance_m <= NEAR_MAX_DISTANCE_M
                else "SEMI_NEAR" if distance_m <= SEMI_NEAR_MAX_DISTANCE_M
                else None
            )
            if relation_type is not None:
                results[pair] = {
                    "from_id": pair[0],
                    "to_id": pair[1],
                    "kind": "physical_walk",
                    "distance_m": round(distance_m),
                    "walking_seconds": round(distance_m / WALKING_SPEED_MPS),
                    "method": method,
                    "source": "generated",
                    "verified": False,
                    "note": "",
                    "relation_type": relation_type,
                }

    for row in manual:
        pair = _pair(row.get("from_id", ""), row.get("to_id", ""))
        if row.get("action") == "exclude":
            results.pop(pair, None)
            continue
        if row.get("action") != "include":
            continue
        distance_m = float(row["distance_m"]) if row.get("distance_m") else None
        walking_seconds = int(row["walking_seconds"]) if row.get("walking_seconds") else None
        if distance_m is None and walking_seconds is not None:
            distance_m = walking_seconds * WALKING_SPEED_MPS
        if walking_seconds is None and distance_m is not None:
            walking_seconds = round(distance_m / WALKING_SPEED_MPS)
        results[pair] = {
            "from_id": pair[0],
            "to_id": pair[1],
            "kind": "physical_walk",
            "distance_m": round(distance_m) if distance_m is not None else None,
            "walking_seconds": walking_seconds,
            "method": "manual",
            "source": "manual",
            "verified": (row.get("verified") or "true").lower() == "true",
            "note": row.get("note", ""),
            "relation_type": (
                "NEAR" if distance_m is not None and distance_m <= NEAR_MAX_DISTANCE_M
                else "SEMI_NEAR"
            ),
        }
    return sorted(results.values(), key=lambda row: (row["from_id"], row["to_id"]))
