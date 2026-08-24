# Campus data

캠퍼스 장소와 실내 원본 데이터는 아래 두 CSV에서 관리합니다.

- `campus_places.csv`: 건물, 매장, 도슨트 지점, 투어 정류장
- `campus_interiors.csv`: 층, 호실, 층별 편의시설

도슨트 지식과 생성 설정은 다음 CSV에서 분리해 관리합니다.

- `campus_facts.csv`: 모든 객체가 공통으로 사용할 수 있는 검증 가능한 사실
- `campus_docents.csv`: 특정 객체의 필수·선택 사실과 낭독 설정

두 파일은 공통적으로 `entity_type`, 전역 고유 `id`, 상위 개체를 가리키는
`parent_id`를 사용합니다. 따라서 `rels_building_floor.csv`와
`rels_floor_room.csv` 같은 관계 전용 파일은 원본 데이터에 필요하지 않습니다.

검증:

```bash
python campusdata/consolidate_csv.py
```

## 분류와 칼럼 매핑

| `entity_type` | 파일 | 핵심 식별/관계 칼럼 |
|---|---|---|
| `building` | `campus_places.csv` | `id`, `building_code` |
| `store` | `campus_places.csv` | `id`, `parent_id`(건물) |
| `docent_spot` | `campus_places.csv` | `id` |
| `tour_stop` | `campus_places.csv` | `id`, `tour_order` |
| `floor` | `campus_interiors.csv` | `id`, `parent_id`(건물) |
| `room` | `campus_interiors.csv` | `id`, `parent_id`(층) |
| `facility` | `campus_interiors.csv` | `id`, `parent_id`(층), `features`, `note` |

빈 칼럼은 해당 분류에 적용되지 않는 속성입니다. 좌표는 모든 장소 분류에서
동일하게 `latitude`, `longitude`, `coordinate_source`로 관리합니다.

## 도슨트 그래프

로더는 `campus_facts.csv`의 각 행을 `Fact` 노드로 만들고 원본 객체에
`HAS_FACT`로 연결합니다. `campus_docents.csv`의 선택적 설정은
`DocentConfig` 노드가 되며 다음 관계를 사용합니다.

```text
(객체)-[:HAS_FACT]->(Fact)
(객체)-[:HAS_DOCENT_CONFIG]->(DocentConfig)
(DocentConfig)-[:REQUIRES_FACT]->(Fact)
(DocentConfig)-[:OPTIONALLY_USES_FACT]->(Fact)
```

`required_fact_ids`와 `optional_fact_ids`는 `|`로 구분합니다. 도슨트 설정이
없는 객체도 `HAS_FACT` 중 중요도가 높은 사실을 선택해 기본 설명을 생성할 수
있으므로 모든 건물과 시설에 `DocentConfig`를 만들 필요는 없습니다.
