import json
import math
import os

import networkx as nx

from utils.routing import haversine


GEOJSON_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "campusdata", "jbnu_walking_path.geojson"
)
BICYCLE_HIGHWAYS = {
    "cycleway",
    "service",
    "living_street",
    "residential",
    "unclassified",
    "tertiary",
    "tertiary_link",
    "track",
}

_graph = None
_nodes = []


def load_bicycle_graph():
    global _graph, _nodes
    if _graph is not None:
        return

    graph = nx.Graph()
    with open(GEOJSON_PATH, "r", encoding="utf-8") as source:
        data = json.load(source)

    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        highway = properties.get("highway") or properties.get("source_highway")
        access = str(
            properties.get("bicycle")
            or properties.get("vehicle")
            or properties.get("access")
            or ""
        ).lower()
        if (
            geometry.get("type") != "LineString"
            or highway not in BICYCLE_HIGHWAYS
            or access == "no"
        ):
            continue

        coordinates = geometry.get("coordinates") or []
        for first, second in zip(coordinates, coordinates[1:]):
            start = (float(first[0]), float(first[1]))
            end = (float(second[0]), float(second[1]))
            distance = haversine(start[1], start[0], end[1], end[0])
            if distance <= 0:
                continue
            graph.add_edge(start, end, weight=distance)

    _graph = graph
    _nodes = list(graph.nodes)
    print(f"Bicycle graph loaded: {len(_nodes)} nodes, {graph.number_of_edges()} edges")


def _nearest_node(lat, lng):
    return min(_nodes, key=lambda node: haversine(lat, lng, node[1], node[0]))


def get_bicycle_path(start, goal):
    load_bicycle_graph()
    if not _nodes:
        return [start, goal]

    start_node = _nearest_node(start["lat"], start["lng"])
    goal_node = _nearest_node(goal["lat"], goal["lng"])
    try:
        path = nx.shortest_path(_graph, start_node, goal_node, weight="weight")
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return [start, goal]

    return [start] + [{"lat": node[1], "lng": node[0]} for node in path] + [goal]


def path_distance(path):
    return round(sum(
        haversine(first["lat"], first["lng"], second["lat"], second["lng"])
        for first, second in zip(path, path[1:])
    ))
