from __future__ import annotations

import math


def _distance(first, second):
    radius = 6_371_000.0
    lat1 = math.radians(first["lat"])
    lat2 = math.radians(second["lat"])
    delta_lat = lat2 - lat1
    delta_lng = math.radians(second["lng"] - first["lng"])
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _path_distance(path):
    return round(sum(_distance(first, second) for first, second in zip(path, path[1:])))


def _bearing(first, second):
    lat1 = math.radians(first["lat"])
    lat2 = math.radians(second["lat"])
    delta_lng = math.radians(second["lng"] - first["lng"])
    y = math.sin(delta_lng) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(delta_lng)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def local_guides(path):
    if len(path) < 2:
        return []
    guides = []
    last_guide_index = 0
    labels = {
        102: "완만하게 왼쪽 방향으로 진행하세요.",
        103: "좌회전하세요.",
        104: "크게 좌회전하세요.",
        105: "완만하게 오른쪽 방향으로 진행하세요.",
        106: "우회전하세요.",
        107: "크게 우회전하세요.",
        108: "유턴하세요.",
    }
    for index in range(1, len(path) - 1):
        incoming = _bearing(path[index - 1], path[index])
        outgoing = _bearing(path[index], path[index + 1])
        delta = (outgoing - incoming + 540) % 360 - 180
        if abs(delta) < 30:
            continue
        distance_since_last = _path_distance(path[last_guide_index:index + 1])
        if distance_since_last < 20:
            continue
        magnitude = abs(delta)
        if magnitude >= 150:
            guide_type = 108
        elif delta < 0:
            guide_type = 102 if magnitude < 55 else 103 if magnitude < 120 else 104
        else:
            guide_type = 105 if magnitude < 55 else 106 if magnitude < 120 else 107
        guides.append({
            "pointIndex": index,
            "type": guide_type,
            "instruction": labels[guide_type],
            "distanceMeters": distance_since_last,
            "durationMilliseconds": 0,
            "coordinate": path[index],
        })
        last_guide_index = index
    guides.append({
        "pointIndex": len(path) - 1,
        "type": 88,
        "instruction": "목적지에 도착했습니다.",
        "distanceMeters": _path_distance(path[last_guide_index:]),
        "durationMilliseconds": 0,
        "coordinate": path[-1],
    })
    return guides

