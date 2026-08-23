# CampusTour GCP 아키텍처 검토 보고서

작성일: 2026-08-21

> 2026-08-23 구현 상태: 공용 AudioGuide 재생 계층과 GCP TTS/GCS API 코드는 적용되었다. 아래 문서에서 Web Speech API를 “현재 구현”으로 설명하는 부분은 검토 당시 상태이며, 실제 GCP 음성 활성화에는 [`gcp-tts-setup.md`](gcp-tts-setup.md)의 버킷·IAM·사전 asset 생성 작업이 추가로 필요하다.

## 1. 결론

현재 CampusTour는 **Cloud Run이 아니라 Compute Engine VM**에 배포하도록 구성되어 있다. GitHub Actions가 VM에 SSH로 접속한 뒤, VM 내부에서 Nginx·Next.js·FastAPI·Neo4j를 Docker Compose로 빌드하고 실행한다.

현 단계에서는 전체 시스템을 Cloud Run으로 급히 옮기기보다 다음 구성이 가장 현실적이다.

1. 당장은 현재 Compute Engine VM을 유지한다.
2. VM에 Ops Agent를 설치하고 Cloud Logging·Cloud Monitoring·Error Reporting을 연결한다.
3. GCP Secret Manager로 서버 비밀값을 관리한다.
4. docent 음성은 FastAPI가 Gemini-TTS를 호출해 생성하고, 브라우저에 오디오를 전달한다.
5. 향후 트래픽이나 운영 요구가 커지면 Next.js와 FastAPI만 Cloud Run으로 분리하고, Neo4j는 영속 스토리지를 가진 VM 또는 관리형 Neo4j에 남긴다.

즉, **VM + Ops Agent + Gemini-TTS** 조합은 현재 프로젝트에 바로 적용 가능하며, Cloud Run 전환은 필수 선행 작업이 아니다.

## 2. 현재 프로젝트의 실제 배포 구조

확인한 파일:

- `.github/workflows/deploy.yml`: 워크플로 이름이 `Deploy to GCP VM`이며 SSH로 VM에 접속한다.
- `docker-compose.yml`: Nginx, Next.js, FastAPI, Neo4j, 일회성 data-loader를 한 VM에서 실행한다.
- `frontend/components/Guide/Navigation/NavigationScreen.tsx`: 현재 음성은 브라우저의 `SpeechSynthesisUtterance`를 사용한다.
- `backend/routers/tour.py`, `backend/routers/review.py`: LLM은 `GOOGLE_API_KEY` 기반 Google Generative AI 연동을 사용한다.

현재 구조를 단순화하면 다음과 같다.

```text
사용자 브라우저
    ↓ HTTP
Compute Engine VM
    ├─ Nginx :80
    ├─ Next.js
    ├─ FastAPI
    └─ Neo4j + Docker named volume
```

이 구성의 장점은 Compose 한 벌로 전체 시스템을 운용할 수 있고, Neo4j의 로컬 영속 볼륨과 장시간 실행 프로세스를 자연스럽게 지원한다는 점이다. 반면 VM 운영체제, Docker, 디스크, 보안 패치, 장애 복구를 직접 책임져야 하며 현재는 단일 VM이므로 한 번의 장애가 전체 서비스 장애로 이어진다.

### 발견된 운영 위험

현재 배포 워크플로는 `main` 배포 때마다 다음 명령을 실행한다.

```bash
docker-compose --profile seed run --rm data-loader python /data/neo4j_loader_v2.py --reset
```

따라서 Neo4j에 런타임으로 저장한 docent 노출 이력, 인기 목적지, 사용자 피드백 등이 같은 데이터베이스에 들어가면 **매 배포 시 초기화될 가능성이 높다**. 운영 전에는 반드시 다음 중 하나로 바꿔야 한다.

- 프로덕션 자동 배포에서는 `--reset`을 제거하고, 명시적인 수동 시드 작업으로 분리한다.
- CSV 기반 기준 데이터와 사용자 활동 데이터를 서로 다른 데이터베이스 또는 저장소에 분리한다.
- 초기화 전 Neo4j 백업을 Cloud Storage에 남기고 복구 절차를 검증한다.

또한 Nginx는 현재 80번 HTTP 포트만 노출한다. 모바일 브라우저 GPS, 음성 및 운영 보안을 고려하면 실제 기기 시연 전 HTTPS가 필요하다.

## 3. Compute Engine VM과 Cloud Run의 차이

| 항목 | Compute Engine VM | Cloud Run |
|---|---|---|
| 운영 단위 | 가상 서버 전체 | 요청을 처리하는 컨테이너 서비스 |
| 관리 책임 | OS, 패치, Docker, 프로세스, 디스크를 직접 관리 | 서버·스케일링·TLS 대부분을 Google이 관리 |
| 비용 특성 | VM이 켜진 시간 동안 지속 과금 | 기본적으로 요청량 기반, 미사용 시 0개까지 축소 가능 |
| 시작 지연 | 항상 켜두면 거의 없음 | 0개에서 시작할 때 콜드 스타트 가능 |
| 로컬 파일 | Persistent Disk로 영속화 가능 | 인스턴스 파일시스템은 임시이며 종료 시 사라짐 |
| 상태 저장 DB | Neo4j 같은 단일 DB 운영에 비교적 자연스러움 | 컨테이너 내부 DB 저장에는 부적합 |
| 확장 | 머신 크기 변경 또는 직접 다중 VM 구성 | 자동 수평 확장과 트래픽 분할 지원 |
| HTTPS | 직접 인증서 또는 로드밸런서 구성 | 서비스별 HTTPS 엔드포인트 기본 제공 |
| 현재 프로젝트 적합도 | 즉시 사용 가능 | 프론트·API 분리 후에 적합 |

Compute Engine은 Google 인프라 위의 **self-managed VM**을 제공하는 IaaS이고, Cloud Run은 컨테이너를 실행하는 완전관리형 플랫폼이다. Cloud Run은 HTTPS, 자동 확장, 트래픽 분할, scale-to-zero를 기본 제공하지만 인스턴스의 쓰기 가능 파일시스템은 영속적이지 않다. [Compute Engine 공식 설명](https://cloud.google.com/products/compute), [Cloud Run 공식 설명](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)

### CampusTour에 대한 판단

현재 Neo4j가 Compose 내부의 named volume에 의존하기 때문에 전체 스택을 그대로 Cloud Run으로 옮기는 것은 권장하지 않는다. Cloud Run 컨테이너의 로컬 파일은 인스턴스 종료 시 사라지며, 요청에 따라 복수 인스턴스가 생성될 수 있으므로 단일 로컬 Neo4j 데이터 저장소와 맞지 않는다.

향후에는 다음과 같은 하이브리드 구조가 가능하다.

```text
Cloud Run: Next.js / FastAPI
              ↓ private network
Compute Engine 또는 Neo4j Aura: Neo4j
Cloud Storage: TTS 캐시와 백업
```

하지만 시연 단계에서는 이전 비용과 복잡도가 이득보다 크다. 우선 VM을 안정화하고 관측 가능성과 백업을 갖추는 편이 낫다.

## 4. GCP Ops Agent란 무엇인가

Ops Agent는 Compute Engine VM의 **로그, 시스템 지표, 애플리케이션 지표 및 OTLP trace를 수집해 Google Cloud Observability로 보내는 에이전트**다. 로그 수집에는 Fluent Bit, 지표·trace 수집에는 OpenTelemetry Collector 계열 구성 요소를 사용한다. Google은 신규 Compute Engine 워크로드에 레거시 Logging/Monitoring agent 대신 Ops Agent를 권장한다. [Ops Agent 개요](https://docs.cloud.google.com/stackdriver/docs/solutions/agents/ops-agent)

이 프로젝트에 설치하면 기본적으로 다음을 한 화면에서 볼 수 있게 만들 수 있다.

- VM CPU, 메모리, 디스크, 네트워크 상태
- 운영체제 로그
- Nginx, FastAPI, Next.js, Neo4j 컨테이너 로그
- Python 예외와 요청 오류
- 디스크 부족, 높은 메모리 사용량, API 장애 알림

다만 **설치만 하면 Docker Compose의 모든 애플리케이션 로그가 자동으로 완벽하게 분류되는 것은 아니다**. Ops Agent 기본 수집 대상에 시스템 로그가 포함되지만, Docker 로그는 VM의 실제 로그 드라이버와 경로에 맞춰 file 또는 journald receiver를 추가하고 JSON 파서를 구성하는 것이 좋다. FastAPI도 한 줄 JSON 형식으로 다음 필드를 출력하도록 맞추면 Logs Explorer에서 검색하기 쉬워진다.

```json
{
  "severity": "ERROR",
  "service": "backend",
  "request_id": "...",
  "path": "/api/guide/nearby",
  "latency_ms": 418,
  "message": "Neo4j query failed"
}
```

비밀번호, API 키, 전체 GPS 이동 이력, 사용자 입력 원문은 로그에 남기지 않아야 한다. GPS가 필요하다면 디버깅용으로 낮은 정밀도로 반올림하거나 명시적 동의와 짧은 보존 기간을 적용해야 한다.

VM 서비스 계정에는 일반적으로 `roles/logging.logWriter`와 `roles/monitoring.metricWriter`가 필요하다. 설치 및 권한 조건은 [Ops Agent 설치 문서](https://docs.cloud.google.com/logging/docs/agent/ops-agent/installation)에서 확인할 수 있다.

### “문제가 생기면 서버 로그를 보면 되는가?”에 대한 답

Ops Agent 적용 전에는 SSH로 접속해 `docker-compose logs`를 확인해야 한다. 적용 후에는 Cloud Console의 Logs Explorer에서 여러 컨테이너와 시스템 로그를 중앙 검색하고, Cloud Monitoring 알림에서 장애를 먼저 감지할 수 있다. 따라서 답은 **그렇지만, 단순 디버그 출력만 추가하는 것보다 구조화 로그 + Ops Agent + 알림이 함께 있어야 실용적이다**.

권장 첫 알림은 다음 네 가지다.

1. 외부 HTTPS `/health` 응답 실패
2. VM 메모리 사용률 85% 이상 지속
3. 디스크 사용률 80% 이상
4. FastAPI `ERROR` 로그 또는 5xx 급증

Cloud Monitoring은 HTTP/HTTPS/TCP uptime check와 이메일·Slack 등의 알림 채널을 지원한다. [Cloud Monitoring 개요](https://docs.cloud.google.com/monitoring/docs/monitoring-overview), [Uptime check 안내](https://docs.cloud.google.com/monitoring/monitoring-uptime)

## 5. Gemini-TTS docent 호환성

### 판정: 호환 가능

Google Cloud Text-to-Speech의 Gemini-TTS는 한국어 `ko-KR`, 단일 화자, 프롬프트 기반 말투·속도·감정 제어를 지원한다. 짧은 캠퍼스 docent 설명을 자연스럽게 읽는 용도와 잘 맞는다. `gemini-2.5-flash-tts`는 지연 시간과 비용을 중시하는 서비스에, `gemini-2.5-pro-tts`는 더 세밀한 표현 제어가 필요한 콘텐츠 제작에 적합하다. [Gemini-TTS 공식 문서](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts)

현재 프론트엔드는 브라우저의 `SpeechSynthesisUtterance`를 사용한다. 이를 완전히 제거하기보다 다음처럼 역할을 나누는 것이 좋다.

| 음성 종류 | 권장 엔진 | 이유 |
|---|---|---|
| “100m 앞에서 우회전” 같은 즉시 길안내 | Web Speech API 우선, Gemini-TTS 선택 | 네트워크 지연 없이 즉시 재생하고 오프라인에 가까운 예비 수단 확보 |
| 목적지 소개 | Gemini-TTS | 자연스러운 톤과 몰입도 중요 |
| 주변 250m 편의시설 docent | Gemini-TTS | 짧은 설명의 품질과 스타일 일관성 중요 |
| 자주 반복되는 고정 안내 | 미리 생성한 Gemini-TTS 파일 | 호출 지연과 중복 비용 절감 |

### 권장 호출 구조

```text
브라우저
  └─ POST /api/tts 또는 WebSocket
          ↓
FastAPI
  ├─ 텍스트 길이·금칙어·캐시 확인
  ├─ VM 서비스 계정으로 Gemini-TTS 호출
  └─ MP3/OGG_OPUS 또는 스트리밍 오디오 반환
          ↓
브라우저 <audio> / Web Audio 재생
```

브라우저에서 Gemini-TTS를 직접 호출하거나 서비스 계정 키를 프론트엔드에 넣어서는 안 된다. VM에 서비스 계정을 연결하고 Application Default Credentials를 사용해야 한다. Gemini-TTS 사용에는 Cloud Text-to-Speech API, 결제 계정, `aiplatform.endpoints.predict` 권한이 필요하며 일반적으로 `roles/aiplatform.user` 역할을 부여한다. Python은 `google-cloud-texttospeech` 2.29.0 이상을 사용할 수 있다.

현재 `GOOGLE_API_KEY`로 호출하는 Gemini LLM과 Cloud TTS의 서버 인증은 별개로 보는 편이 안전하다. 기존 키 기반 LLM 연동은 그대로 유지할 수 있지만, TTS는 VM 서비스 계정과 IAM을 이용하는 구성이 권장된다.

### 구현 시 주의점

- TTS 문장을 1~3문장 단위로 짧게 유지한다.
- 다음 길안내가 가까우면 docent를 중단하고 길안내 음성을 우선한다.
- 목적지 소개와 다음 주변시설 음성을 미리 생성해 1~2개 정도 prefetch한다.
- 목적지 ID, 시설 ID, 문장, voice, prompt 버전으로 캐시 키를 만든다.
- 같은 시설을 같은 세션에서 반복 안내하지 않는다.
- Cloud API 실패나 통신 불량 시 기존 Web Speech API와 화면 텍스트로 fallback한다.
- 오디오는 재생 종료·중단·목적지 변경 이벤트를 명확히 처리한다.

Gemini-TTS는 MP3, OGG_OPUS, PCM 등 여러 출력 형식을 지원한다. 모바일 웹의 초기 구현은 단순한 unary MP3 또는 OGG_OPUS 응답이 가장 구현하기 쉽고, 실제 지연이 문제가 될 때 스트리밍으로 확장하는 편이 좋다. 입력 길이와 요청 한도는 모델별 제한이 있으므로 긴 보고서식 설명보다 현재 기획한 짧은 docent 문장이 적합하다. 기본 요청 한도와 가격은 변경될 수 있으므로 적용 시 [Text-to-Speech 할당량](https://docs.cloud.google.com/text-to-speech/quotas)과 [가격표](https://cloud.google.com/text-to-speech/pricing)를 다시 확인해야 한다.

## 6. 추가로 잘 맞는 GCP 기능

### 우선순위 A: 배포 전에 권장

#### 1) Secret Manager

`NAVER_MAP_CLIENT_SECRET`, `GOOGLE_API_KEY`, `NEO4J_PASSWORD`를 VM의 평문 `.env`에 장기간 보관하는 대신 Secret Manager에서 버전과 IAM으로 관리할 수 있다. 비밀값 조회 권한은 백엔드 서비스 계정에만 최소한으로 부여한다. [Secret Manager 개요](https://docs.cloud.google.com/secret-manager/docs/overview), [보안 권장사항](https://docs.cloud.google.com/secret-manager/docs/best-practices)

#### 2) Error Reporting

Cloud Logging에 들어온 Python stack trace를 오류 유형별로 묶어서 발생 횟수와 최초·최근 시각을 보여준다. FastAPI 예외를 찾는 시간이 줄어든다. VM 서비스 계정에는 필요 시 `roles/errorreporting.writer`를 부여한다. [Python Error Reporting 설정](https://docs.cloud.google.com/error-reporting/docs/setup/python)

#### 3) Cloud Monitoring uptime check와 알림

외부 `/health` 점검, VM 자원 사용량, 로그 기반 오류 알림을 구성한다. 시연 직전에 사람이 계속 SSH로 확인하지 않아도 장애를 알 수 있다.

#### 4) HTTPS

GCP 외부 Application Load Balancer와 관리형 인증서 또는 VM의 Certbot 중 하나를 선택한다. 시연용 단일 VM이라면 Certbot이 단순하고, 향후 Cloud Run/다중 인스턴스 전환을 고려하면 로드밸런서가 더 확장성 있다.

### 우선순위 B: 안정화 단계

#### 5) Artifact Registry + Cloud Build

현재는 4GB VM에서 Docker 이미지를 직접 빌드한 다음 실행 중인 컨테이너를 내린다. 빌드 중 메모리 부족이나 배포 중단 시간이 생길 수 있다. Cloud Build에서 이미지를 먼저 빌드·검증해 Artifact Registry에 저장하고, VM은 검증된 태그를 pull하도록 바꾸면 배포 실패와 롤백 관리가 쉬워진다. [Cloud Build와 Artifact Registry 연결](https://docs.cloud.google.com/artifact-registry/docs/configure-cloud-build), [Docker 이미지 빌드 안내](https://docs.cloud.google.com/build/docs/build-push-docker-image)

#### 6) Cloud Storage

다음 두 종류의 파일 저장에 적합하다.

- 자주 재사용하는 Gemini-TTS 오디오 캐시
- Neo4j 정기 백업 파일

캐시에는 7~30일 TTL을, 백업에는 버전 보존 규칙을 적용할 수 있다. Object Lifecycle Management로 오래된 파일을 자동 삭제하거나 저렴한 저장 등급으로 전환할 수 있다. [Cloud Storage 수명 주기 관리](https://docs.cloud.google.com/storage/docs/lifecycle)

#### 7) Cloud Scheduler

정기적인 Neo4j 백업, 오래된 TTS 캐시 정리, 데이터 품질 검사 작업을 호출하는 데 사용할 수 있다. 단, 백업 스크립트와 복구 검증이 먼저 준비되어야 한다.

### 우선순위 C: 사용 데이터가 쌓인 뒤

#### 8) Firestore 또는 BigQuery

- Firestore: 인기 목적지 카운터, 즐겨찾기, 간단한 피드백처럼 앱에서 즉시 읽고 쓰는 데이터
- BigQuery: 검색→이동수단 선택→경로 시작→도착 같은 익명 이벤트의 장기 분석

현재 Neo4j는 건물·층·시설 관계 탐색에 집중시키고, 사용자 행동 데이터는 별도 저장소에 두는 편이 배포 시드 초기화 문제와 데이터 모델 복잡도를 줄인다. 정확한 GPS 이동 경로는 기본 수집 대상에서 제외하고, 필요한 경우 목적·보존 기간·익명화 기준을 먼저 정해야 한다.

#### 9) Cloud Trace / OpenTelemetry

FastAPI 요청 하나가 Neo4j 조회, Naver Directions5, Gemini LLM, Gemini-TTS 중 어디에서 느려지는지 구간별로 추적할 때 유용하다. 초기에는 구조화 로그의 `request_id`로 충분하며, 실제 성능 병목이 생길 때 추가해도 늦지 않다.

## 7. 권장 도입 순서

### 1단계: 현재 VM 안정화

- HTTPS 적용
- `/health`와 가능하면 `/ready` 엔드포인트 확정
- 배포 시 자동 Neo4j `--reset` 제거 또는 수동화
- Neo4j 백업·복구 절차 작성
- Ops Agent 설치 및 Docker 로그 수집 설정
- Cloud Monitoring 알림 4종 구성
- Secret Manager 적용

### 2단계: Gemini-TTS docent 최소 기능

- 백엔드 TTS endpoint 추가
- `gemini-2.5-flash-tts`, 한국어 단일 voice로 시작
- 목적지 설명을 먼저 재생
- 주변 250m 시설 중 미안내 항목을 간격을 두고 재생
- 길안내 우선순위, 중단, fallback 구현
- 시설 ID별 재생 기록 저장
- 고정 문장 캐시 도입

### 3단계: 배포와 분석 개선

- Artifact Registry + 외부 이미지 빌드
- Cloud Storage 백업과 TTS 캐시
- 사용자 피드백·인기 목적지를 Firestore 등에 분리
- 필요할 때 프론트/백엔드만 Cloud Run으로 이전 검토

## 8. 다음 지시 전에 결정하면 좋은 항목

1. 현재 VM을 유지하면서 관측·TTS부터 붙일지 여부
2. Gemini-TTS의 기본 화자와 말투: 친근한 재학생, 차분한 공식 안내, 활기찬 투어 가이드 중 선택
3. 생성 음성을 Cloud Storage에 캐시할지, 초기에는 매번 생성할지
4. docent 재생 이력을 세션 종료 후 폐기할지, 사용자 계정별 보고서용으로 보존할지
5. 배포 때 Neo4j를 매번 초기화하는 현재 동작을 즉시 중단할지

## 최종 제안

이 프로젝트에는 당장 Cloud Run보다 **Compute Engine VM을 제대로 운영 가능하게 만드는 작업**이 우선이다. Ops Agent, 구조화 로그, Monitoring, Secret Manager, 백업을 먼저 적용하면 현재 구조를 크게 흔들지 않고도 장애 대응력이 올라간다.

Gemini-TTS는 docent 목적과 기술적으로 잘 맞는다. 다만 모든 길안내 음성을 클라우드 TTS로 바꾸기보다, **즉시성이 중요한 회전 안내는 현재 Web Speech API를 fallback으로 유지하고 목적지·시설 설명부터 Gemini-TTS로 전환**하는 방식이 안전하고 구현 효율도 높다.
