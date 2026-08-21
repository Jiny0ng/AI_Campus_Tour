#!/usr/bin/env python3
"""Validate the two canonical CampusTour CSV data files."""

from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent
CANONICAL_FILES = ("campus_places.csv", "campus_interiors.csv")
PLACE_TYPES = {"building", "store", "docent_spot", "tour_stop"}
INTERIOR_TYPES = {"floor", "room"}


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

    if errors:
        raise ValueError("Canonical CSV validation failed:\n- " + "\n- ".join(errors))
    print(
        "Validated canonical campus data: "
        + ", ".join(f"{key}={counts[key]}" for key in sorted(counts))
    )


if __name__ == "__main__":
    validate()
