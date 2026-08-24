#!/usr/bin/env python3
"""Merge the integrated building-facility CSV into canonical campus interiors."""

from __future__ import annotations

import argparse
import csv
import hashlib
import unicodedata
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parent
PLACES_PATH = DATA_DIR / "campus_places.csv"
INTERIORS_PATH = DATA_DIR / "campus_interiors.csv"
FIELDNAMES = (
    "entity_type", "id", "parent_id", "building_code", "building_name",
    "floor", "room_no", "name", "category", "features", "note",
)
BUILDING_ALIASES = {
    "동아리 전용관": "동아리전용관",
    "진수당 교육연구동": "진수당",
}


def normalized(value: str) -> str:
    return unicodedata.normalize("NFC", (value or "").strip())


def canonical_floor(value: str) -> str:
    value = normalized(value)
    if value in {"B1", "지하"}:
        return "지하"
    if value == "공통":
        return value
    return value if value.endswith("층") else f"{value}층"


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [
            {normalized(str(key)): normalized(value or "") for key, value in row.items()}
            for row in csv.DictReader(file)
        ]


def facility_id(building_id: str, floor: str, row: dict[str, str]) -> str:
    identity = "|".join((
        building_id, floor, row["facility"], row["시설·좌석 유형"],
        row["이용·특징"], row["비고"],
    ))
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    return f"facility:{building_id.removeprefix('building:')}:{digest}"


def merge(source_path: Path) -> dict[str, int]:
    places = read_rows(PLACES_PATH)
    interiors = read_rows(INTERIORS_PATH)
    source_rows = read_rows(source_path)
    buildings = {
        row["name"]: row
        for row in places
        if row.get("entity_type") == "building" and row.get("name")
    }

    mapped: list[tuple[dict[str, str], dict[str, str], str]] = []
    missing: set[str] = set()
    for row in source_rows:
        source_name = row["building"]
        canonical_name = BUILDING_ALIASES.get(source_name, source_name)
        building = buildings.get(canonical_name)
        if building is None:
            missing.add(source_name)
            continue
        mapped.append((row, building, canonical_floor(row["floor"])))
    if missing:
        raise ValueError("Unmatched building names: " + ", ".join(sorted(missing)))

    retained = [row for row in interiors if row.get("entity_type") != "facility"]
    floor_by_key = {
        (row.get("parent_id", ""), row.get("floor", "")): row
        for row in retained
        if row.get("entity_type") == "floor"
    }
    added_floors = 0
    facility_rows: list[dict[str, str]] = []
    for source, building, floor in mapped:
        building_id = building["id"]
        key = (building_id, floor)
        if key not in floor_by_key:
            new_floor = {
                "entity_type": "floor",
                "id": f"floor:{building_id}:{floor}",
                "parent_id": building_id,
                "building_code": building.get("building_code", ""),
                "building_name": building["name"],
                "floor": floor,
            }
            retained.append(new_floor)
            floor_by_key[key] = new_floor
            added_floors += 1
        facility_rows.append({
            "entity_type": "facility",
            "id": facility_id(building_id, floor, source),
            "parent_id": floor_by_key[key]["id"],
            "building_code": building.get("building_code", ""),
            "building_name": building["name"],
            "floor": floor,
            "room_no": "",
            "name": source["facility"],
            "category": source["시설·좌석 유형"],
            "features": source["이용·특징"],
            "note": source["비고"],
        })

    with INTERIORS_PATH.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=FIELDNAMES,
            extrasaction="ignore",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(retained + facility_rows)
    return {
        "sourceRows": len(source_rows),
        "matchedBuildings": len({building["id"] for _, building, _ in mapped}),
        "addedFloors": added_floors,
        "facilities": len(facility_rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    print(merge(args.source))


if __name__ == "__main__":
    main()
