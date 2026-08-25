#!/usr/bin/env python3
"""Validate the canonical CampusTour CSV data files."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent
CANONICAL_FILES = ("campus_places.csv", "campus_interiors.csv")
CONTENT_FILES = ("campus_facts.csv", "campus_docents.csv")
NEAR_OVERRIDES_FILE = "campus_near_overrides.csv"
PLACE_TYPES = {"building", "store", "docent_spot", "tour_stop"}
INTERIOR_TYPES = {"floor", "room", "facility"}


def read_csv(filename: str) -> list[dict[str, str]]:
    path = DATA_DIR / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required canonical CSV is missing: {path}")
    with path.open(encoding="utf-8-sig", newline="") as file:
        return [
            {key: (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(file, skipinitialspace=True)
        ]


def validate() -> None:
    places = read_csv(CANONICAL_FILES[0])
    interiors = read_csv(CANONICAL_FILES[1])
    errors: list[str] = []

    invalid_place_types = sorted(
        {row.get("entity_type", "") for row in places} - PLACE_TYPES
    )
    invalid_interior_types = sorted(
        {row.get("entity_type", "") for row in interiors} - INTERIOR_TYPES
    )
    if invalid_place_types:
        errors.append(f"invalid place entity_type values: {invalid_place_types}")
    if invalid_interior_types:
        errors.append(f"invalid interior entity_type values: {invalid_interior_types}")

    all_rows = places + interiors
    counts = Counter(row.get("entity_type", "") for row in all_rows)
    ids = [row.get("id", "") for row in all_rows]
    blank_ids = [index + 2 for index, value in enumerate(ids) if not value]
    if blank_ids:
        errors.append(f"blank ids at combined row numbers: {blank_ids[:10]}")
    duplicate_ids = sorted(value for value, count in Counter(ids).items() if count > 1)
    if duplicate_ids:
        errors.append(f"duplicate ids: {duplicate_ids[:10]}")

    known_ids = set(ids)
    dangling = sorted(
        row["id"] for row in all_rows
        if row.get("parent_id") and row["parent_id"] not in known_ids
    )
    if dangling:
        errors.append(f"dangling parent_id values: {dangling[:10]}")

    near_overrides = read_csv(NEAR_OVERRIDES_FILE)
    near_candidate_ids = {
        row["id"] for row in places
        if row.get("entity_type") in PLACE_TYPES
        and row.get("latitude") and row.get("longitude")
    }
    seen_near_pairs: set[tuple[str, str]] = set()
    for row in near_overrides:
        pair = tuple(sorted((row.get("from_id", ""), row.get("to_id", ""))))
        if not all(value in near_candidate_ids for value in pair) or pair[0] == pair[1]:
            errors.append(f"near override has invalid entity IDs: {pair}")
        if pair in seen_near_pairs:
            errors.append(f"duplicate near override pair: {pair}")
        seen_near_pairs.add(pair)
        if row.get("action") not in {"include", "exclude"}:
            errors.append(f"near override has invalid action: {pair}")
        if (row.get("verified") or "true").lower() not in {"true", "false"}:
            errors.append(f"near override has invalid verified value: {pair}")
        if row.get("action") == "include" and not (
            row.get("distance_m") or row.get("walking_seconds")
        ):
            errors.append(f"included near override needs distance or walking time: {pair}")

    route_orders = sorted(
        int(row["tour_order"])
        for row in places
        if row["entity_type"] == "tour_stop"
    )
    if route_orders != list(range(1, len(route_orders) + 1)):
        errors.append(f"tour_order is not continuous: {route_orders}")

    missing_names = [
        row["id"] for row in places
        if row["entity_type"] in {"building", "docent_spot", "tour_stop"}
        and not row.get("name")
    ]
    if missing_names:
        errors.append(f"place rows with blank names: {missing_names[:10]}")

    facts = read_csv(CONTENT_FILES[0])
    docents = read_csv(CONTENT_FILES[1])
    fact_ids = [row.get("fact_id", "") for row in facts]
    duplicate_fact_ids = sorted(
        value for value, count in Counter(fact_ids).items() if count > 1
    )
    if "" in fact_ids or duplicate_fact_ids:
        errors.append(f"blank or duplicate fact ids: {duplicate_fact_ids[:10]}")
    invalid_fact_entities = sorted(
        row.get("entity_id", "") for row in facts if row.get("entity_id") not in known_ids
    )
    if invalid_fact_entities:
        errors.append(f"facts with unknown entity_id: {invalid_fact_entities[:10]}")
    facts_by_entity: dict[str, set[str]] = {}
    for row in facts:
        facts_by_entity.setdefault(row.get("entity_id", ""), set()).add(row.get("fact_id", ""))
        try:
            importance = int(row.get("importance", ""))
            if not 0 <= importance <= 100:
                raise ValueError
        except ValueError:
            errors.append(f"invalid fact importance: {row.get('fact_id', '')}")
        if row.get("verified") not in {"true", "false"}:
            errors.append(f"invalid fact verified value: {row.get('fact_id', '')}")
    docent_entity_ids = [row.get("entity_id", "") for row in docents]
    duplicate_docents = sorted(
        value for value, count in Counter(docent_entity_ids).items() if count > 1
    )
    if duplicate_docents:
        errors.append(f"duplicate docent configs: {duplicate_docents[:10]}")
    for row in docents:
        entity_id = row.get("entity_id", "")
        if entity_id not in known_ids:
            errors.append(f"docent with unknown entity_id: {entity_id}")
        configured_ids = {
            value.strip()
            for field in ("required_fact_ids", "optional_fact_ids")
            for value in row.get(field, "").split("|")
            if value.strip()
        }
        missing = sorted(configured_ids - facts_by_entity.get(entity_id, set()))
        if missing:
            errors.append(f"docent {entity_id} references unknown facts: {missing}")

    if errors:
        raise ValueError("Canonical CSV validation failed:\n- " + "\n- ".join(errors))
    print(
        "Validated canonical campus data: "
        + ", ".join(f"{key}={counts[key]}" for key in sorted(counts))
    )


if __name__ == "__main__":
    validate()
