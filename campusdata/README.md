# CampusTour Data

CampusTour가 사용하는 캠퍼스 장소, 실내 시설, 도슨트 사실, 경로와 음성 콘텐츠를 관리합니다. 이 폴더의 CSV와 GeoJSON은 Neo4j 지식 그래프, 경로 계산 및 AI 도슨트 생성의 기준 데이터입니다.

애플리케이션 실행과 전체 구조는 [루트 README](../README.md)를 참고하세요.

## 데이터 구성

| 파일 | 분류 | 역할 |
|---|---|---|
| `campus_places.csv` | 원천 데이터 | 건물, 매장, 도슨트 지점과 투어 정류장 |
| `campus_interiors.csv` | 원천 데이터 | 층, 호실과 층별 편의시설 |
| `campus_facts.csv` | 원천 데이터 | 객체에 연결되는 검증 가능한 사실 |
| `campus_docents.csv` | 원천 데이터 | 도슨트별 필수·선택 사실과 낭독 설정 |
| `campus_near_overrides.csv` | 원천 데이터 | 자동 보행 인접 관계의 수동 추가·제외 |
| `jbnu_walking_path.geojson` | 경로 데이터 | 도보·자전거용 캠퍼스 경로 그래프 |
| `jbnu_drive_path.geojson` | 경로 데이터 | 차량 접근 경로 데이터 |
| `audio_content/*.csv` | 음성 원천 데이터 | 시스템 문구, 내비게이션 템플릿과 filler |
| `audio_content/generated_docents.json` | 생성 데이터 | 검증을 통과한 생성 도슨트 대본 |
| `audio_content/audio_manifest.json` | 생성 데이터 | 활성 음성 자산과 콘텐츠 hash 목록 |

원천 데이터는 사람이 검토하고 수정하는 기준값입니다. `generated_docents.json`과 `audio_manifest.json`은 생성 스크립트가 관리하므로 직접 편집하지 않습니다.

## 객체 식별과 관계 규칙

CSV 객체는 공통적으로 다음 규칙을 사용합니다.

- `entity_type`: 객체 종류
- `id`: 전체 데이터에서 고유한 식별자
- `parent_id`: 상위 객체의 `id`
- `latitude`, `longitude`: WGS84 좌표
- `coordinate_source`: 좌표의 출처

| `entity_type` | 파일 | 핵심 관계 |
|---|---|---|
| `building` | `campus_places.csv` | 최상위 건물 객체 |
| `parking` | `campus_places.csv` | 좌표를 가진 교내 주차장·주차 가능 공간 |
| `store` | `campus_places.csv` | `parent_id`로 건물 참조 |
| `docent_spot` | `campus_places.csv` | 주변 도슨트 지점 |
| `tour_stop` | `campus_places.csv` | `tour_order`를 가진 투어 정류장 |
| `floor` | `campus_interiors.csv` | `parent_id`로 건물 참조 |
| `room` | `campus_interiors.csv` | `parent_id`로 층 참조 |
| `facility` | `campus_interiors.csv` | `parent_id`로 층 참조 |

건물→층→호실 관계는 `parent_id`로 표현합니다. 동일 관계를 별도의 관계 CSV에 중복 저장하지 않습니다.

## 물리적 인접 관계

좌표가 있는 건물·장소·옥외 시설은 `jbnu_walking_path.geojson`의 최단 보행 경로가 60초 이내일 때 `NEAR` 관계로 연결됩니다. 보행 속도는 앱의 경로 시간 계산과 같은 초당 1.3m를 사용하며, 장소에서 보행망까지의 연결 거리도 포함합니다. 보행망에 연결할 수 없는 좌표에 한해서만 직선거리 80m 기준을 사용합니다. 실내 시설은 좌표가 없으므로 소속 건물의 인접 관계를 이용합니다.

80m를 초과하고 350m 이하인 장소 쌍은 `SEMI_NEAR`로 연결합니다. 이 관계는 바로 옆 장소가 아니라 “조금 거리가 있지만 가볼 만한 곳”을 제안할 때 사용하며, `NEAR` 결과가 있을 때보다 낮은 우선순위로 조회합니다.

```text
(장소)-[:NEAR {
  kind: "physical_walk",
  distance_m: 61,
  walking_seconds: 47,
  method: "walking_network",
  source: "generated",
  verified: false
}]-(장소)
```

자동 판단을 현장 정보로 보정하려면 `campus_near_overrides.csv`에 안정적인 객체 ID 두 개를 기록합니다. `action`은 `include` 또는 `exclude`이며, `include`에는 확인한 거리와 보행시간을 선택적으로 기록할 수 있습니다. 같은 객체 쌍을 중복해서 기록할 수 없습니다.

```csv
from_id,to_id,action,distance_m,walking_seconds,verified,note
building:4-3,building:4-4,include,61,48,true,횡단보도 건너편
building:3-1,building:3-2,exclude,,,true,실제 출입구가 반대편
```

## 도슨트 지식 그래프

`campus_facts.csv`의 각 행은 검증 가능한 `Fact` 노드가 되고 원본 객체에 연결됩니다. `campus_docents.csv`의 설정은 `DocentConfig` 노드로 적재됩니다.

```text
(객체)-[:HAS_FACT]->(Fact)
(객체)-[:HAS_DOCENT_CONFIG]->(DocentConfig)
(DocentConfig)-[:REQUIRES_FACT]->(Fact)
(DocentConfig)-[:OPTIONALLY_USES_FACT]->(Fact)
```

`required_fact_ids`와 `optional_fact_ids`는 `|`로 구분합니다. 필수 사실은 생성 대본에 반드시 포함되어야 하며, 선택 사실은 분량과 맥락에 따라 제한적으로 사용합니다. 도슨트 설정이 없는 객체는 중요도가 높은 사실을 이용해 기본 설명을 만들 수 있습니다.

## 데이터 변경 절차

1. 수정하려는 객체의 기존 `id`, `entity_type`과 상위 관계를 확인합니다.
2. 원천 CSV를 수정하고 좌표와 사실의 출처를 기록합니다.
3. 데이터 검증을 실행합니다.
4. 필요한 경우 로컬 Neo4j에 다시 적재합니다.
5. 도슨트 사실을 변경했다면 대본과 음성 자산을 dry-run으로 검증합니다.
6. 변경된 화면, 검색 결과와 경로를 확인한 뒤 커밋합니다.

운영 데이터는 단순히 파일을 수정했다고 즉시 바뀌지 않습니다. Neo4j 적재와 필요한 생성 자산 갱신까지 완료해야 애플리케이션에 반영됩니다.

## 검증

루트의 Docker Compose를 실행한 상태에서 다음 명령을 사용합니다.

```bash
docker compose exec backend python /campusdata/consolidate_csv.py
docker compose exec backend python /app/scripts/validate_audio_manifest.py
```

직접 Python 환경을 구성한 경우에는 루트에서 다음과 같이 실행할 수도 있습니다.

```bash
python3 campusdata/consolidate_csv.py
python3 backend/scripts/validate_audio_manifest.py
```

`consolidate_csv.py`는 ID 중복, 필수 필드, 상위 관계, 사실 참조와 주요 데이터 규칙을 검사합니다. 검증 실패 상태의 데이터는 적재하거나 배포하지 않습니다.

## Neo4j 적재

최초 환경 구성 또는 기준 데이터 변경 후 다음 명령을 실행합니다.

```bash
docker compose --profile seed run --rm data-loader
```

기본 적재는 기존 운영 데이터를 무조건 삭제하지 않는 방식으로 사용합니다. 전체 초기화가 필요한 옵션은 대상 환경과 백업을 확인한 경우에만 사용합니다.

## 도슨트 및 음성 자산

기본 실행은 외부 상태를 변경하지 않는 dry-run입니다.

```bash
python3 backend/scripts/generate_docent_assets.py
python3 backend/scripts/generate_audio_assets.py
python3 backend/scripts/validate_audio_manifest.py
```

실제 생성과 GCS 업로드에는 GCP 프로젝트, private 버킷, IAM, ADC와 `--apply`가 필요합니다. 자세한 절차는 [GCP TTS 운영 설정](../docs/gcp-tts-setup.md)을 따릅니다.

생성 파이프라인은 다음 조건을 만족한 경우에만 새 manifest를 활성화합니다.

- 필수 fact ID와 필수 숫자 포함
- 길이 및 첫 문장 규칙 통과
- 별도 생성형 AI 검수 통과
- manifest가 참조하는 모든 MP3의 GCS 존재 확인

실패하면 현재 활성 대본과 manifest를 유지합니다.

## 보조 스크립트

| 스크립트 | 용도 |
|---|---|
| `consolidate_csv.py` | 기준 CSV의 구조와 관계 검증 |
| `neo4j_loader_v2.py` | CSV 데이터를 Neo4j에 적재 |
| `build_vehicle_graph.py` | 입력 공간 데이터에서 차량 경로 GeoJSON 생성 |
| `import_integrated_facilities.py` | 외부 통합 시설 데이터를 기준 형식으로 변환 |

보조 스크립트가 원천 파일을 덮어쓸 수 있는 경우에는 입력과 출력 경로를 먼저 확인하고 Git diff로 결과를 검토합니다.

## 유지관리 원칙

- 동일한 객체 ID를 재사용하거나 의미를 바꾸지 않습니다.
- 표시 이름만으로 관계를 만들지 않고 안정적인 `id`와 `parent_id`를 사용합니다.
- 좌표, 역사 정보, 운영 시간과 숫자 정보에는 검증 가능한 출처를 남깁니다.
- 생성형 AI가 만든 문장을 검증 없이 `campus_facts.csv`에 추가하지 않습니다.
- CSV 컬럼을 변경할 때는 로더, 검증기, 백엔드 모델과 문서를 함께 수정합니다.
- 원천 데이터와 생성 데이터를 구분하고 생성 JSON을 수동 편집하지 않습니다.
- 임시 변환 파일과 백업 파일을 이 폴더에 커밋하지 않습니다.
