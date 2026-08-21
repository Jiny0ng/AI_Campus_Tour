# Campus data

캠퍼스 원본 데이터는 아래 두 CSV만 수정합니다.

- `campus_places.csv`: 건물, 매장, 도슨트 지점, 투어 정류장
- `campus_interiors.csv`: 층, 호실

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

빈 칼럼은 해당 분류에 적용되지 않는 속성입니다. 좌표는 모든 장소 분류에서
동일하게 `latitude`, `longitude`, `coordinate_source`로 관리합니다.
