#!/usr/bin/env python3
"""Build a conservative vehicle-routing GeoJSON from the combined campus paths.

The source contains both pedestrian and road features.  This script keeps known
motor-vehicle road classes, preserves corrected manual road geometry, and adds
normalized properties that a routing loader can consume without guessing.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path(__file__).with_name("jbnu_walking_path.geojson")
DEFAULT_OUTPUT = Path(__file__).with_name("jbnu_drive_path.geojson")

DRIVABLE_HIGHWAYS = {
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "unclassified",
    "residential",
    "living_street",
    "service",
}

NON_DRIVABLE_ACCESS = {"no"}

DEFAULT_SPEED_KPH = {
    "motorway": 80,
    "motorway_link": 50,
    "trunk": 60,
    "trunk_link": 40,
    "primary": 50,
    "primary_link": 40,
    "secondary": 40,
    "secondary_link": 30,
    "tertiary": 30,
    "tertiary_link": 25,
    "unclassified": 25,
    "residential": 20,
    "living_street": 15,
    "service": 15,
}


def effective_highway(properties: dict[str, Any]) -> str | None:
    """Use the corrected feature's source road class when highway is absent."""
    value = properties.get("highway") or properties.get("source_highway")
    return str(value).lower() if value else None


def normalized_access(properties: dict[str, Any]) -> str:
    for key in ("motor_vehicle", "vehicle", "access"):
        value = properties.get(key)
        if value and str(value).lower() != "unknown":
            return str(value).lower()
    return "unknown"


def is_drivable(feature: dict[str, Any]) -> tuple[bool, str]:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "LineString":
        return False, "not_linestring"
    if len(geometry.get("coordinates") or []) < 2:
        return False, "too_few_coordinates"

    properties = feature.get("properties") or {}
    highway = effective_highway(properties)
    if highway not in DRIVABLE_HIGHWAYS:
        return False, f"highway:{highway or 'missing'}"
    if normalized_access(properties) in NON_DRIVABLE_ACCESS:
        return False, "motor_vehicle:no"
    return True, "included"


def is_oneway(properties: dict[str, Any]) -> bool:
    value = str(properties.get("oneway") or "").lower()
    return value in {"yes", "true", "1", "-1"}


def normalize_feature(feature: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(feature)
    properties = result.setdefault("properties", {})
    highway = effective_highway(properties)
    access = normalized_access(properties)

    properties["effective_highway"] = highway
    properties["drivable"] = True
    properties["vehicle_access"] = access
    properties["campus_private_access"] = access == "private"
    properties["oneway"] = is_oneway(properties)
    properties["bidirectional"] = not properties["oneway"]
    properties["routing_speed_kph"] = DEFAULT_SPEED_KPH[highway]
    properties["routing_source"] = "jbnu_walking_path_vehicle_filter_v1"
    return result


def duplicate_preference(feature: dict[str, Any]) -> tuple[int, int, int]:
    """Rank duplicate IDs, preferring the authoritative and fuller correction."""
    properties = feature.get("properties") or {}
    coordinates = (feature.get("geometry") or {}).get("coordinates") or []
    return (
        int(properties.get("source_layer") == "jbnu_manual_workfile"),
        int(properties.get("status") == "active"),
        len(coordinates),
    )


def coordinate_key(coordinate: list[float]) -> tuple[float, float]:
    # Seven decimal places are sub-centimetre precision at this latitude and
    # merge only coordinates that are effectively identical in the source.
    return round(float(coordinate[0]), 7), round(float(coordinate[1]), 7)


def graph_stats(features: list[dict[str, Any]]) -> dict[str, Any]:
    adjacency: dict[tuple[float, float], set[tuple[float, float]]] = defaultdict(set)
    edge_count = 0
    total_length_m = 0.0

    for feature in features:
        coordinates = feature["geometry"]["coordinates"]
        for first, second in zip(coordinates, coordinates[1:]):
            a, b = coordinate_key(first), coordinate_key(second)
            if a == b:
                continue
            if b not in adjacency[a]:
                edge_count += 1
                total_length_m += haversine_m(a[1], a[0], b[1], b[0])
            adjacency[a].add(b)
            adjacency[b].add(a)

    unseen = set(adjacency)
    component_sizes: list[int] = []
    while unseen:
        start = unseen.pop()
        size = 0
        queue = deque([start])
        while queue:
            node = queue.popleft()
            size += 1
            for neighbor in adjacency[node]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    queue.append(neighbor)
        component_sizes.append(size)
    component_sizes.sort(reverse=True)

    return {
        "node_count": len(adjacency),
        "edge_count": edge_count,
        "component_count": len(component_sizes),
        "largest_component_nodes": component_sizes[0] if component_sizes else 0,
        "largest_component_ratio": round(
            (component_sizes[0] / len(adjacency)) if adjacency else 0.0, 4
        ),
        "total_length_m": round(total_length_m, 1),
    }


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000.0
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    dlat = lat2_rad - lat1_rad
    dlon = math.radians(lon2 - lon1)
    value = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    return radius_m * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def build(input_path: Path, output_path: Path) -> dict[str, Any]:
    source = json.loads(input_path.read_text(encoding="utf-8"))
    source_features = source.get("features") or []

    # If a local correction replaces an OSM feature, do not retain both copies.
    replaced_ids = {
        str((feature.get("properties") or {}).get("replaces_source_id"))
        for feature in source_features
        if (feature.get("properties") or {}).get("replaces_source_id")
    }

    selected_by_id: dict[str, dict[str, Any]] = {}
    selected_without_id: list[dict[str, Any]] = []
    excluded = Counter()
    skipped_replaced = 0
    deduplicated = 0
    for feature in source_features:
        if str(feature.get("id")) in replaced_ids:
            skipped_replaced += 1
            continue
        include, reason = is_drivable(feature)
        if include:
            feature_id = feature.get("id")
            if feature_id is None:
                selected_without_id.append(normalize_feature(feature))
                continue
            feature_id = str(feature_id)
            previous = selected_by_id.get(feature_id)
            if previous is None:
                selected_by_id[feature_id] = feature
            else:
                deduplicated += 1
                if duplicate_preference(feature) > duplicate_preference(previous):
                    selected_by_id[feature_id] = feature
        else:
            excluded[reason] += 1

    selected = [
        normalize_feature(feature) for feature in selected_by_id.values()
    ] + selected_without_id

    stats = graph_stats(selected)
    highway_counts = Counter(
        feature["properties"]["effective_highway"] for feature in selected
    )
    stats.update(
        {
            "source_feature_count": len(source_features),
            "vehicle_feature_count": len(selected),
            "skipped_replaced_feature_count": skipped_replaced,
            "deduplicated_vehicle_feature_count": deduplicated,
            "highway_counts": dict(sorted(highway_counts.items())),
            "excluded_counts": dict(sorted(excluded.items())),
        }
    )

    result = {
        "type": "FeatureCollection",
        "name": "JBNU vehicle routing paths",
        "crs": source.get("crs"),
        "attribution": source.get("attribution", []),
        "generated_from": input_path.name,
        "filter_version": 1,
        "routing_defaults": {
            "direction_policy": "source oneway when present; otherwise bidirectional",
            "private_access_policy": "included for campus navigation",
            "excluded_highways": ["footway", "path", "steps", "cycleway", "pedestrian"],
        },
        "graph_stats": stats,
        "features": selected,
    }
    output_path.write_text(
        json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    stats = build(args.input, args.output)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
