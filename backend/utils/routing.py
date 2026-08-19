import json
import math
import os
import networkx as nx

# 전북대 캠퍼스 도보 경로 GeoJSON 파일 경로
GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "campusdata", "jbnu_walking_path.geojson")

G = None
nodes = []

def load_graph():
    global G, nodes
    if G is not None:
        return
    G = nx.Graph()
    if not os.path.exists(GEOJSON_PATH):
        print(f"Routing geojson not found at {GEOJSON_PATH}")
        return
        
    with open(GEOJSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for feature in data.get('features', []):
        geom = feature.get('geometry')
        if not geom or geom.get('type') != 'LineString':
            continue
            
        coords = geom.get('coordinates', [])
        for i in range(len(coords) - 1):
            p1 = (coords[i][0], coords[i][1])
            p2 = (coords[i+1][0], coords[i+1][1])
            
            # Haversine distance
            dist = haversine(p1[1], p1[0], p2[1], p2[0])
            
            props = feature.get('properties', {})
            highway = props.get('highway')
            
            # 차도(도로중앙선) 패널티 부여: 도보 경로 최우선 활용
            if props.get('source_layer') == 'public_road_centerline':
                dist *= 10.0
            else:
                # 데이터 속성이 "도보 전용"이 아닌 차량용 도로일 경우 강한 패널티 (사용자 요청)
                car_roads = ['tertiary', 'tertiary_link', 'unclassified', 'residential']
                if highway in car_roads:
                    dist *= 1.6  # 간선(차도) 이용 시 1.6배 패널티
                elif highway == 'service':
                    dist *= 1.4  # 서비스 도로(주차장 등)는 1.4배 패널티
                else:
                    # 큰길 우대 가중치 적용 (0.9배)
                    is_main = False
                    if 'RVWD' in props:
                        try:
                            if float(props['RVWD']) >= 4.0:
                                is_main = True
                        except:
                            pass
                    elif highway in ['pedestrian', 'living_street']:
                        is_main = True
                    
                    if is_main:
                        dist *= 0.9
                
            # 노드 간 거리가 5미터 이상일 경우 중간 노드를 생성하여 촘촘하게 만듦 (정확한 스냅핑을 위해)
            MAX_SEGMENT_LENGTH = 5.0
            real_dist = haversine(p1[1], p1[0], p2[1], p2[0])
            if real_dist > MAX_SEGMENT_LENGTH:
                num_segments = math.ceil(real_dist / MAX_SEGMENT_LENGTH)
                segment_weight = dist / num_segments
                
                prev_point = p1
                for j in range(1, num_segments):
                    fraction = j / num_segments
                    mid_lon = p1[0] + (p2[0] - p1[0]) * fraction
                    mid_lat = p1[1] + (p2[1] - p1[1]) * fraction
                    mid_point = (mid_lon, mid_lat)
                    
                    G.add_edge(prev_point, mid_point, weight=segment_weight)
                    prev_point = mid_point
                    
                G.add_edge(prev_point, p2, weight=segment_weight)
            else:
                G.add_edge(p1, p2, weight=dist)
            
    nodes = list(G.nodes)
    print(f"Routing graph loaded: {len(nodes)} nodes, {G.number_of_edges()} edges")

def haversine(lat1, lon1, lat2, lon2):
    # km 단위 거리 계산
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c * 1000  # meters

def find_nearest_node(lat, lon):
    if not nodes:
        return (lon, lat)
    # 간단한 최소 거리 탐색 (노드 수가 많지 않으므로 O(N)으로 충분)
    best_node = None
    min_dist = float('inf')
    for n in nodes:
        # n is (lon, lat)
        dist = haversine(lat, lon, n[1], n[0])
        if dist < min_dist:
            min_dist = dist
            best_node = n
    return best_node

def get_shortest_path(start_coord, end_coord, visited_edges=None):
    """
    start_coord, end_coord: dict like {"x": 127.123, "y": 35.123}
    visited_edges: set of frozensets (point1, point2) to penalize
    Returns a list of dicts [{"x": 127.123, "y": 35.123}, ...]
    """
    load_graph()
    if G is None or len(nodes) == 0:
        return [start_coord, end_coord]
        
    start_n = find_nearest_node(start_coord["y"], start_coord["x"])
    end_n = find_nearest_node(end_coord["y"], end_coord["x"])
    
    def weight_func(u, v, d):
        base_w = d.get('weight', 1.0)
        if visited_edges:
            edge_set = frozenset([u, v])
            if edge_set in visited_edges:
                # 건물 진출입로(Driveway) 패널티 면제:
                # 출발지(start_n)나 도착지(end_n)로부터 반경 30m 이내에 있는 간선은 패널티를 주지 않음
                dist_to_start_u = haversine(u[1], u[0], start_n[1], start_n[0])
                dist_to_start_v = haversine(v[1], v[0], start_n[1], start_n[0])
                dist_to_end_u = haversine(u[1], u[0], end_n[1], end_n[0])
                dist_to_end_v = haversine(v[1], v[0], end_n[1], end_n[0])
                
                min_dist = min(dist_to_start_u, dist_to_start_v, dist_to_end_u, dist_to_end_v)
                
                if min_dist > 30.0:
                    # 이미 지난 길을 다시 걸으면 30m를 더 걷는 것과 같은 덧셈(Additive) 페널티를 부여
                    return base_w + 30.0
        return base_w
    
    try:
        path = nx.shortest_path(G, source=start_n, target=end_n, weight=weight_func)
        # 변환 (출발지와 도착지 정확한 좌표 추가)
        res = [start_coord]
        for p in path:
            res.append({"x": p[0], "y": p[1]})
        res.append(end_coord)
        return res
    except nx.NetworkXNoPath:
        # 경로를 찾을 수 없으면 직선 연결 반환
        return [start_coord, end_coord]
    except Exception as e:
        print(f"Routing error: {e}")
        return [start_coord, end_coord]
