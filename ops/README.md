# CampusTour Operations

CampusTour가 배포된 Compute Engine VM의 로그 수집, 상태 확인, 알림과 장애 대응 절차를 설명합니다. `ops-agent-config.yaml`은 Google Cloud Ops Agent의 기본 host 관측 기능을 유지하면서 Docker 컨테이너 JSON 로그 수집을 추가합니다.

전체 시스템 실행과 배포 개요는 [루트 README](../README.md), GCP 구성 판단은 [아키텍처 검토](../docs/gcp-architecture-review.md)를 참고하세요.

## 운영 구조

```text
인터넷
  │ HTTPS :443
  ▼
Caddy
  └─ Next.js
       └─ FastAPI
            ├─ Neo4j
            ├─ Naver Directions
            └─ GCP TTS / Cloud Storage

Compute Engine VM
  ├─ Docker Compose
  ├─ Ops Agent
  ├─ Cloud Logging
  └─ Cloud Monitoring
```

Caddy는 공개 HTTPS, 인증서 발급·갱신과 HTTP→HTTPS 리다이렉트를 담당합니다. Next.js와 FastAPI는 Docker 내부 네트워크로 통신하며 FastAPI와 Neo4j 관리 포트는 VM의 loopback에만 바인딩됩니다.

## Ops Agent 설정

`ops-agent-config.yaml`의 추가 동작은 다음과 같습니다.

- `/var/lib/docker/containers/*/*-json.log` 수집
- 원본 로그 파일 경로 기록
- Docker 로그를 `campus_docker_pipeline`으로 Cloud Logging에 전달
- Ops Agent 기본 host CPU, 메모리, 디스크, 네트워크 및 system log pipeline 유지

애플리케이션 로그는 텍스트로 수집합니다. 일부 로그 행의 형식이 잘못되어도 전체 수집이 중단되지 않으며 Cloud Logging에서 `ERROR`, `Traceback`, `TtsUnavailable`, `AudioStorageUnavailable` 등을 검색할 수 있습니다.

## 설정 적용

VM의 기존 Ops Agent 설정을 먼저 백업한 후 저장소 설정을 반영합니다. 대상 경로와 기존 사용자 설정을 확인하지 않은 상태에서 덮어쓰지 않습니다.

설정 검증:

```bash
sudo /opt/google-cloud-ops-agent/libexec/google_cloud_ops_agent_engine \
  -in /etc/google-cloud-ops-agent/config.yaml
```

검증 성공 후 Agent만 재시작합니다.

```bash
sudo systemctl restart google-cloud-ops-agent
sudo systemctl status google-cloud-ops-agent --no-pager
```

Ops Agent 재시작은 애플리케이션 컨테이너를 재시작하지 않습니다.

## 권장 모니터링과 알림

| 대상 | 권장 조건 | 목적 |
|---|---|---|
| 공개 health endpoint | 2분 이상 연속 실패 | 실제 사용자 관점의 서비스 장애 탐지 |
| VM 메모리 | 85% 이상 5분 지속 | FastAPI·Next.js·Neo4j OOM 사전 감지 |
| 파일시스템 | 80% 이상 5분 지속 | Docker 이미지·로그·Neo4j 데이터 증가 감지 |
| Ops Agent 상태 | 수집 중단 | 로그와 메트릭 관측 공백 감지 |
| 배포 워크플로 | 실패 | 새 버전 교체 또는 공개 HTTPS 검증 실패 탐지 |

공개 점검 주소는 특정 IP를 문서에 하드코딩하지 않고 다음 형식을 사용합니다.

```text
https://<CAMPUS_SITE_ADDRESS>/api/health/network
```

알림 채널의 이메일, 프로젝트 ID, VM 이름과 리소스 ID는 저장소에 커밋하지 않고 Cloud Monitoring에서 관리합니다.

CPU 순간 사용률과 단일 로그 문자열만으로 즉시 호출하는 경보는 오탐이 많을 수 있습니다. 사용자 영향은 외부 uptime check로 우선 탐지하고 자원 경보를 원인 분석에 결합합니다.

## 배포 후 확인

배포 워크플로는 다음 항목을 자동 확인합니다.

- Docker Compose 서비스와 이미지 빌드
- Neo4j 시작 및 비파괴 기준 데이터 적재
- FastAPI root와 `/health/network`
- Next.js 홈 응답
- 공개 HTTPS endpoint
- HTTP→HTTPS `308` 리다이렉트

수동 점검이 필요하면 다음 순서로 확인합니다.

```bash
curl -fsS "https://<CAMPUS_SITE_ADDRESS>/api/health/network"
docker compose ps
docker compose logs --tail=200 caddy frontend backend neo4j
docker stats --no-stream
df -h
```

실제 명령에서는 `<CAMPUS_SITE_ADDRESS>`를 운영 도메인으로 바꿉니다.

## 장애 대응 순서

### 1. 사용자 관점 확인

- 공개 홈과 `/api/health/network`의 HTTP 상태를 확인합니다.
- 전체 장애인지 지도·검색·음성 등 특정 기능 장애인지 구분합니다.
- 장애 시작 시각, 마지막 정상 시각과 직전 배포 여부를 기록합니다.

### 2. 컨테이너 상태 확인

```bash
docker compose ps
docker stats --no-stream
docker compose logs --since=15m --tail=300 caddy frontend backend neo4j
```

반복 재시작, health 상태, OOM, 디스크 오류와 외부 API timeout을 확인합니다.

### 3. 호스트와 Ops Agent 확인

```bash
df -h
free -h
journalctl -u docker --since "15 minutes ago"
journalctl -u google-cloud-ops-agent --since "15 minutes ago"
```

### 4. Cloud Logging 확인

- VM 이름과 장애 시각으로 범위를 좁힙니다.
- `ERROR`, `Traceback`, timeout과 unavailable 계열 메시지를 확인합니다.
- 동일 요청 시각의 Caddy→Next.js→FastAPI 로그 흐름을 비교합니다.
- TTS 장애라면 지도와 텍스트 안내가 정상 유지되는지도 확인합니다.

### 5. 복구와 사후 확인

- 원인이 확인된 서비스만 재시작합니다.
- 무조건적인 전체 재시작이나 데이터 초기화는 피합니다.
- 복구 후 공개 endpoint와 핵심 사용자 흐름을 다시 확인합니다.
- 원인, 영향 범위, 복구 작업과 재발 방지 항목을 기록합니다.

## 서비스별 빠른 진단

| 증상 | 우선 확인 |
|---|---|
| HTTPS 접속 실패 | Caddy 로그, 80·443 방화벽, DNS/sslip.io와 인증서 상태 |
| 화면은 열리나 API 실패 | Next.js Route Handler 로그, FastAPI 상태와 `API_BASE_URL` |
| 검색 결과 없음 | Neo4j health, 데이터 적재 결과와 백엔드 로그 |
| 자동차 경로 실패 | Naver API 키, Web 서비스 설정, Directions 응답과 quota |
| 음성만 실패 | `/api/health/network`, TTS 환경변수, VM ADC, GCS IAM과 버킷 |
| VM 메모리 부족 | 컨테이너별 사용량, Neo4j heap/pagecache와 재시작 이력 |
| 디스크 부족 | Docker 이미지·로그, Neo4j volume과 Caddy 데이터 크기 |

## 운영 안전 원칙

- 장애 원인 확인 전 `git reset`, 데이터 초기화 또는 volume 삭제를 실행하지 않습니다.
- 운영 `.env`, 서비스 계정 키와 사용자 정보가 로그나 문서에 노출되지 않게 합니다.
- Neo4j 적재는 기본적으로 비파괴 방식을 사용하며 초기화 전 백업을 확인합니다.
- 배포 실패 시 새 변경을 겹쳐 배포하기보다 실패한 revision과 로그를 먼저 보존합니다.
- 음성 장애는 전체 서비스 장애로 확대하지 않고 텍스트 안내 유지 여부를 함께 확인합니다.
- Caddy와 Neo4j의 named volume은 일반 재배포 시 보존합니다.
