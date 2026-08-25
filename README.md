# AI Campus Tour

전북대학교 방문자와 학생을 위한 모바일 중심의 AI 캠퍼스 안내 서비스입니다. 사용자의 현재 위치와 이동 수단을 바탕으로 캠퍼스 길찾기, 주변 시설 검색, AI 도슨트와 다국어 음성 안내를 제공합니다.

일반 지도 서비스가 충분히 표현하지 못하는 교내 보행로, 건물 출입구, 층·호실·편의시설 관계를 자체 데이터로 관리하고, 이를 Neo4j 지식 그래프와 GeoJSON 경로 데이터, 생성형 AI에 연결한 것이 핵심입니다.

> 현재 프로젝트는 단일 저장소에서 Next.js 프론트엔드, FastAPI 백엔드, Neo4j 데이터, 음성 콘텐츠 파이프라인과 GCP 운영 설정을 함께 관리하는 모노레포입니다.

## 주요 기능

- 캠퍼스 건물·시설·부서·호실 통합 검색
- 도보·자전거·자동차별 길안내와 캠퍼스 전용 경로 계산
- 위치, 주변 POI와 다음 목적지를 반영한 AI 도슨트 안내
- 한국어·영어·일본어·중국어 캠퍼스 명칭 및 음성 안내
- 길안내가 도슨트 음성을 선점하는 공용 오디오 재생 큐
- 다음 안내 및 다음 투어 장소의 음성 자산 사전 로딩
- 네트워크·GPS·음성 서비스 장애 시 화면 텍스트 안내 유지
- 사용자 리뷰 저장과 AI 요약
- 모바일 환경의 GPS, 기기 방향과 Naver Maps 연동

## 현재 구현 상태

| 영역 | 상태 | 설명 |
|---|---|---|
| 캠퍼스 검색·시설 안내 | 구현 | Neo4j 데이터를 이용해 건물, 층, 호실과 편의시설을 검색합니다. |
| 도보·자전거 경로 | 구현 | 캠퍼스 GeoJSON과 NetworkX 기반으로 경로를 계산합니다. |
| 자동차 경로 | 구현 | 서버에서 Naver Directions API를 호출해 브라우저에 비밀 키가 노출되지 않게 합니다. |
| AI 투어·도슨트 | 구현 | 캠퍼스 사실 데이터와 프롬프트를 조합해 투어 콘텐츠를 생성합니다. |
| 공용 음성 계층 | 구현 | 단일 오디오 큐, 우선순위, 중복 방지, 캐시와 장애 강등을 지원합니다. |
| 다국어 표시 | 구현 | 영어·일본어·중국어 고유명사 데이터와 로케일별 렌더링을 지원합니다. |
| GCP TTS 운영 활성화 | 외부 설정 필요 | Cloud TTS, private GCS 버킷, IAM과 ADC 설정이 필요합니다. |
| 운영 모니터링 | 설정 제공 | Ops Agent, Cloud Logging·Monitoring 구성과 장애 확인 절차를 제공합니다. |

지도와 텍스트 안내는 GCP 음성 리소스가 없어도 동작합니다. 실제 클라우드 음성을 활성화하려면 [GCP TTS 운영 설정](docs/gcp-tts-setup.md)을 참고하세요.

## 최근 반영 사항

- 캠퍼스 고유명사의 영어·일본어·중국어 번역 데이터와 로케일별 화면 표시 추가
- 도슨트 대본 및 음성 자산 생성 작업의 진행 로그와 재개 가능한 처리 방식 보강
- 사실 기반 도슨트 검증과 편집 가능한 인사이트 콘텐츠 지원
- Caddy 기반 HTTPS 자동 발급·갱신 및 HTTP→HTTPS 리다이렉트 적용
- 공용 GCP TTS 재생 계층, private GCS 캐시와 사전 생성 파이프라인 적용
- 사용하지 않는 일부 개발용 더미 데이터 정리

세부 구현 범위와 아직 필요한 외부 작업은 [공용 GCP TTS 구현 상태](docs/shared-gcp-tts-implementation-status.md)에 기록합니다.

## 기술 스택

| 구분 | 기술 | 역할 |
|---|---|---|
| Frontend | Next.js 15, React 19, TypeScript 5 | 모바일 UI, App Router, 서버 측 API 프록시 |
| Styling | Tailwind CSS 3, Framer Motion | 반응형 화면과 인터랙션 |
| Map | Naver Maps JavaScript API, Directions 5 | 지도 표시, 위치와 자동차 경로 |
| Backend | FastAPI, Uvicorn, Python | 캠퍼스·투어·경로·TTS API |
| Graph | Neo4j 5, Neo4j Python Driver | 건물·시설·층·호실과 사실 관계 저장 |
| Routing | NetworkX, GeoJSON | 캠퍼스 보행·자전거 경로 계산 |
| AI | Gemini, LangChain, YAML Prompt | 도슨트 대본 생성과 리뷰 요약 |
| Audio | Google Cloud Text-to-Speech, Cloud Storage | 음성 합성, 고정 자산과 동적 캐시 |
| Infrastructure | Docker Compose, Caddy | 서비스 구성, reverse proxy와 HTTPS |
| Deployment | GitHub Actions, Compute Engine | main 브랜치 기반 VM 자동 배포 |
| Observability | GCP Ops Agent, Logging, Monitoring | 컨테이너 로그, 자원 및 가용성 관측 |

정확한 패키지 버전은 `frontend/package.json`, `frontend/package-lock.json`과 `backend/requirements.txt`를 기준으로 합니다.

## 시스템 구조

```text
모바일 브라우저
  ├─ Naver Maps / GPS / DeviceOrientation
  ├─ 화면 텍스트 안내
  └─ 단일 AudioGuide 재생 큐
                  │ HTTPS
                  ▼
        Caddy reverse proxy
                  │
                  ▼
        Next.js 15 / React 19
          └─ /api 서버 프록시
                  │ Docker network
                  ▼
              FastAPI
       ├─ 캠퍼스 검색·투어 API
       ├─ NetworkX 경로 계산
       ├─ Gemini 콘텐츠 생성
       └─ GCP TTS·GCS 음성 계층
          │                 │
          ▼                 ▼
       Neo4j           Google Cloud
```

브라우저는 백엔드나 외부 API 비밀 키에 직접 접근하지 않습니다. Next.js Route Handler가 FastAPI 요청을 중계하고, FastAPI가 Neo4j, Naver Directions와 Google Cloud 서비스에 접근합니다.

## 설계 인사이트

### 캠퍼스 데이터는 기능의 기준점입니다

건물·시설·층·호실 같은 구조 데이터와 검증 가능한 도슨트 사실을 CSV로 관리하고 Neo4j에 적재합니다. 서비스 로직에서 정보를 임의로 복제하기보다 `campusdata/`를 원천 데이터로 유지해 검색, 경로와 도슨트가 같은 기준을 사용하도록 설계했습니다.

### 경로 계산은 이동 수단에 따라 분리합니다

도보와 자전거는 캠퍼스 내부 GeoJSON 그래프를 사용하고, 자동차는 Naver Directions를 사용합니다. 하나의 범용 알고리즘에 모든 이동 수단을 맞추지 않아 캠퍼스 내부 지름길과 실제 도로망을 각각 활용할 수 있습니다.

### 음성은 화면을 보완하며 서비스 전체를 막지 않습니다

길안내, 도슨트와 시스템 메시지는 하나의 재생 계층을 공유하지만 우선순위와 캐시 범위는 분리됩니다. TTS나 네트워크가 실패해도 지도와 텍스트 안내는 계속 제공하는 점진적 강등 방식을 사용합니다.

### 생성형 AI 출력은 검증 가능한 데이터에 묶습니다

도슨트 대본은 캠퍼스 사실과 필수 fact ID를 기반으로 생성하고 결정론적 검사와 별도 검수를 거칩니다. 생성 결과는 곧바로 운영 데이터가 되지 않으며, 모든 검증과 음성 자산 준비가 끝난 경우에만 manifest를 활성화합니다.

## 디렉터리 구조

```text
CampusTour/
├── frontend/                 # Next.js 화면, 상태, API 프록시와 정적 음성
│   ├── app/                  # App Router 페이지와 Route Handler
│   ├── components/           # 기능·화면 단위 React 컴포넌트
│   ├── contexts/             # 앱 설정과 공용 AudioGuide 상태
│   ├── lib/                  # API, 경로, 네트워크와 음성 도메인 로직
│   ├── locales/              # 다국어 고유명사 데이터
│   ├── public/               # 브라우저에 제공되는 정적 자산
│   └── types/                # 공유 TypeScript 타입
├── backend/                  # FastAPI 애플리케이션
│   ├── routers/              # 투어, 안내, 경로, 리뷰와 TTS API
│   ├── services/             # 도슨트 생성, 콘텐츠와 음성 저장 로직
│   ├── prompts/              # Graph RAG 프롬프트
│   ├── scripts/              # 음성 자산 생성·검증과 런타임 진단
│   ├── utils/                # 경로 계산과 내비게이션 유틸리티
│   └── tests/                # 백엔드 단위 테스트
├── campusdata/               # CSV·GeoJSON 원천 데이터와 Neo4j 적재 도구
│   └── audio_content/        # 도슨트, 시스템 문구와 음성 manifest
├── caddy/                    # reverse proxy와 HTTPS 설정
├── ops/                      # GCP Ops Agent 설정과 장애 대응 절차
├── docs/                     # 설계 검토, 운영 가이드와 기술 보고서
├── .github/workflows/        # 배포 및 음성 자산 갱신 자동화
├── docker-compose.yml        # 로컬·운영 서비스 구성
└── .env.example              # 환경변수 템플릿
```

폴더별 세부 규칙은 [프론트엔드 안내](frontend/README.md), [캠퍼스 데이터 안내](campusdata/README.md), [운영 관측 안내](ops/README.md)를 참고하세요.

## 시작하기

### 준비 사항

- Git
- Docker Engine과 Docker Compose
- Naver Maps API 클라이언트 ID 및 Directions용 서버 비밀 키
- Neo4j 로컬 계정 정보
- AI 도슨트를 사용할 경우 Gemini API 키
- GCP 음성을 사용할 경우 프로젝트, private GCS 버킷과 ADC 권한

### 1. 저장소와 환경변수 준비

```bash
git clone https://github.com/Jiny0ng/AI_Campus_Tour.git
cd AI_Campus_Tour
cp .env.example .env
```

`.env`에서 최소한 다음 값을 설정합니다.

```env
NEO4J_USER=neo4j
NEO4J_PASSWORD=change-me
GOOGLE_API_KEY=your-gemini-api-key
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
NAVER_MAP_CLIENT_SECRET=your-naver-directions-secret
API_BASE_URL=http://backend:8000
CAMPUS_SITE_ADDRESS=http://localhost
```

| 환경변수 | 공개 여부 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 브라우저 공개 | Naver 지도 렌더링 |
| `NAVER_MAP_CLIENT_SECRET` | 서버 전용 | 자동차 Directions API |
| `GOOGLE_API_KEY` | 서버 전용 | Gemini 도슨트 생성과 요약 |
| `NEO4J_USER`, `NEO4J_PASSWORD` | 서버 전용 | 지식 그래프 접속 |
| `GCP_PROJECT_ID`, `TTS_BUCKET_NAME` | 서버 전용 | GCP 음성 및 저장소 |
| `CAMPUS_SITE_ADDRESS` | 설정값 | Caddy가 제공할 로컬 주소 또는 공개 도메인 |

실제 비밀값이 들어 있는 `.env`와 `frontend/.env.local`은 Git에 커밋하지 않습니다.

### 2. 전체 서비스 실행

```bash
docker compose up -d --build
```

로컬 접속 주소:

- 애플리케이션: `http://localhost`
- FastAPI 직접 확인: `http://localhost:8001/docs`
- Neo4j Browser: `http://localhost:7475`

서비스 상태는 다음 명령으로 확인합니다.

```bash
docker compose ps
docker compose logs -f backend frontend
```

### 3. 기준 데이터 적재

최초 실행 또는 캠퍼스 원천 데이터를 갱신한 경우에만 실행합니다.

```bash
docker compose --profile seed run --rm data-loader
```

운영 데이터 삭제를 동반하는 초기화 옵션은 기본 배포 과정에서 사용하지 않습니다. 데이터 형식과 검증 명령은 [Campus data](campusdata/README.md)를 참고하세요.

### 4. 프론트엔드만 개발 실행

```bash
cd frontend
npm ci
npm run dev
```

개발 서버는 `http://localhost:4173`에서 실행됩니다. 필요한 프론트엔드 환경변수는 `frontend/.env.local`에 설정합니다.

## 검증

```bash
# 프론트엔드 프로덕션 빌드
cd frontend
npm run build

# 백엔드 단위 테스트(Docker Compose 실행 후)
cd ..
docker compose exec backend python -m unittest discover -s tests -p 'test_*.py'

# 캠퍼스 데이터 검증
docker compose exec backend python /campusdata/consolidate_csv.py

# 음성 manifest 검증
docker compose exec backend python /app/scripts/validate_audio_manifest.py
```

GCP 리소스를 실제로 변경하는 음성 생성 명령은 기본적으로 실행하지 않습니다. dry-run과 `--apply` 절차는 [GCP TTS 운영 설정](docs/gcp-tts-setup.md)을 따릅니다.

## 배포와 운영

`main` 브랜치에 반영된 코드는 GitHub Actions가 Compute Engine VM에 SSH로 접속해 배포합니다. VM에서는 Docker Compose가 Caddy, Next.js, FastAPI와 Neo4j를 실행하며 Caddy가 공개 인증서 발급·갱신을 담당합니다.

배포 전 다음 외부 설정이 필요합니다.

1. VM의 고정 외부 IP 또는 연결할 도메인
2. TCP 80·443 인바운드 방화벽 허용
3. Naver Maps Web 서비스 URL에 최종 HTTPS 주소 등록
4. GitHub Actions의 VM 접속 secrets 설정
5. 음성을 사용할 경우 GCP 버킷, IAM과 VM 서비스 계정 설정

장애 확인과 모니터링 기준은 [운영 관측 안내](ops/README.md)를 참고하세요.

## 문서 안내

| 문서 | 내용 |
|---|---|
| [Frontend README](frontend/README.md) | 프론트엔드 구조, 환경변수와 개발 포트 |
| [Campus data README](campusdata/README.md) | CSV 스키마, 객체 관계와 Neo4j 적재 기준 |
| [Operations README](ops/README.md) | Ops Agent, 알림 기준과 장애 확인 순서 |
| [GCP 아키텍처 검토](docs/gcp-architecture-review.md) | VM·Cloud Run 비교와 단계별 GCP 도입 판단 |
| [GCP TTS 운영 설정](docs/gcp-tts-setup.md) | Cloud TTS, GCS, IAM과 음성 자산 생성 절차 |
| [공용 TTS 구현 상태](docs/shared-gcp-tts-implementation-status.md) | 구현 범위, 계획과 달라진 점, 남은 외부 작업 |
| [프로젝트 기술 보고서](docs/project-technical-report.md) | 기능, 기술 구조와 GCP 활용을 종합한 보고서 |

## 알려진 제약과 운영 원칙

- GPS, DeviceOrientation와 모바일 오디오 자동 재생은 HTTPS 및 사용자 상호작용에 영향을 받습니다.
- GPS 정확도가 낮을 때는 자동 도착 판정을 신뢰하지 않고 수동 확인 UI로 보완합니다.
- Neo4j는 현재 단일 Compute Engine VM의 Docker volume에 저장되므로 백업과 VM 장애 복구 정책이 필요합니다.
- GCP TTS와 Storage 장애는 음성 기능에만 영향을 주어야 하며 지도와 텍스트 안내를 중단시키지 않습니다.
- 운영 비밀값과 서비스 계정 JSON 키는 저장소나 Docker 이미지에 포함하지 않습니다.
- 캠퍼스 사실과 번역은 코드에 흩어 쓰지 않고 원천 데이터와 locale 파일에서 관리합니다.

## 기여 및 유지관리 원칙

- 기능 변경 시 관련 테스트와 문서를 함께 갱신합니다.
- 같은 설명을 여러 README에 복사하지 않고 하나의 기준 문서에 작성한 뒤 링크합니다.
- 자동 생성 파일, 로컬 캐시, 비밀값과 임시 백업은 Git에 추가하지 않습니다.
- 캠퍼스 데이터 변경은 검증 후 적재하며 생성형 AI 결과를 검증 없이 기준 데이터로 사용하지 않습니다.
- 배포 설정 변경은 로컬 빌드와 health check를 통과한 뒤 반영합니다.

## 라이선스

현재 저장소에는 별도 라이선스 파일이 없습니다. 외부 공개 또는 제3자 배포 전에 사용 범위와 라이선스를 명시해야 합니다.
