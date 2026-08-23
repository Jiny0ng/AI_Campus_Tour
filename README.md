# 🎓 AI Campus Tour (캠퍼스 적응형 AI 투어)

[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/Jiny0ng/AI_Campus_Tour)

**AI Campus Tour**는 전북대학교 캠퍼스를 방문하는 사용자(신입생, 외부인 등)를 위해 Graph DB와 생성형 AI(Graph RAG)를 결합하여 **맞춤형 동적 길 안내**와 **상황 맞춤형 도슨트(음성 안내)**를 제공하는 웹 애플리케이션입니다.

단순한 지도 탐색을 넘어, 사용자의 **실시간 위치(GPS)**와 **바라보는 방향(DeviceOrientation)**을 인식하여 주변 건물과 역사에 대한 흥미로운 이야기를 실시간으로 들려줍니다.

---

## ✨ 핵심 기능 (Key Features)

1. **지식 그래프(Neo4j) 기반 최적 라우팅**
   - 기존의 단순한 최단거리 탐색을 넘어, '건물 관통', '계단 없는 길(휠체어/스쿠터)' 등 캠퍼스 특화 엣지(Edge) 데이터를 활용하여 투어 테마별 최적의 경로(Waypoints)를 생성합니다.
2. **상황 맞춤형 AI 도슨트 (Graph RAG)**
   - 사용자가 위치한 곳의 주변 편의시설(POI), 건물 정보, 다음 목적지를 조합하여 LangChain(Gemini 모델)이 자연스러운 안내 대본을 사전 생성합니다.
   - 예: *"우측 전방에 보이는 큰 건물이 도서관입니다. 바로 1층에 24시간 편의점이 있으니 참고하세요!"*
3. **유저 피드백 기반 동적 경로 수정**
   - 투어 중 "도서관은 안 갈래"와 같은 유저의 피드백을 실시간으로 반영하여 즉각적으로 남은 경로와 도슨트를 재생성합니다.
4. **공용 클라우드 TTS 및 방향 인식**
   - 안내와 투어가 하나의 Google Cloud TTS 재생 큐를 공유하며, 길 안내가 도슨트 음성을 선점합니다. 음성 장애 시에는 화면 텍스트 안내를 유지합니다.

---

## 🛠 기술 스택 (Tech Stack)

### Frontend (PWA)
*   **Framework**: Next.js (App Router), React
*   **Styling**: Tailwind CSS
*   **API**: HTML Audio API, DeviceOrientation API (방위각)

### Backend (GraphRAG API)
*   **Framework**: FastAPI, Uvicorn (`Python 3.12`)
*   **AI / LLM**: LangChain, Google Gemini API (`langchain-google-genai`)
*   **Prompting**: YAML 기반 Few-shot 프롬프트 엔지니어링

### Database & Infrastructure
*   **Database**: Neo4j (`5.20-community`), Neo4j Python Driver
*   **Container**: Docker & Docker Compose

---

## 📂 프로젝트 구조 (Project Structure)

프론트엔드와 백엔드가 완벽하게 분리된 모노레포(Monorepo) 형태를 취하고 있습니다.

```text
AI_Campus_Tour/
├── frontend/         # Next.js 프론트엔드 소스코드 (UI, 상태 관리, 맵 렌더링)
├── backend/          # FastAPI 백엔드 소스코드 (투어 생성 및 도슨트 로직)
│   ├── routers/      # API 엔드포인트
│   └── prompts/      # 프롬프트 템플릿 (yaml)
├── campusdata/       # Neo4j 초기 적재 스크립트 및 공간/속성 마스터 데이터
├── docker-compose.yml# 백엔드 서버 및 Neo4j DB 컨테이너 실행 파일
└── .env              # 통합 환경변수 파일 (API 키 등)
```

---

## 🚀 시작하기 (Getting Started)

프로젝트를 로컬에서 실행하기 위한 방법입니다.

### 1. 레포지토리 클론 및 환경 설정
```bash
git clone https://github.com/Jiny0ng/AI_Campus_Tour.git
cd AI_Campus_Tour
```
루트 경로에 `.env` 파일을 생성하고 아래의 값을 채워 넣습니다. (참고: `.env.example`)
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
GOOGLE_API_KEY=your_gemini_api_key
```

### 2. 백엔드 및 데이터베이스 실행 (Docker)
Docker가 설치되어 있어야 합니다. 아래 명령어로 Neo4j와 FastAPI 서버를 한 번에 백그라운드에서 실행합니다.
```bash
docker-compose up -d --build
```
> 백엔드 API 문서(Swagger) 확인: `http://localhost:8001/docs`
>
> Neo4j Browser 확인: `http://localhost:7475`

초기 데이터는 최초 한 번 또는 마스터 데이터 갱신 시에만 다음 명령으로 적재합니다.

```bash
docker compose --profile seed up data-loader
```

### 3. 프론트엔드 실행
백엔드가 정상적으로 켜졌다면, 새로운 터미널을 열고 프론트엔드 서버를 켭니다.
```bash
cd frontend
npm install
npm run dev
```
> 웹 브라우저에서 `http://localhost:3000` 으로 접속하여 앱을 확인합니다.

---

## ⚠️ 로컬 테스트 주의사항 (HTTPS)
본 프로젝트의 핵심인 `DeviceOrientation` (나침반 방향 탐색), GPS, 오디오 자동 재생 기능은 모바일 기기로 로컬 망에서 접속 시 브라우저 보안 정책상 HTTPS와 사용자 상호작용이 필요합니다. 모바일 기기로 접속 테스트를 하시려면 HTTPS 터널링 또는 개발 인증서를 활용해 주시기 바랍니다.

> 음성 안내는 현재 공용 Google Cloud TTS 재생 계층을 사용한다. GCP가 설정되지 않았거나 네트워크가 불안정한 경우 지도와 화면 텍스트 안내는 계속 제공된다. 운영 설정과 사전 음성 생성 방법은 [`docs/gcp-tts-setup.md`](docs/gcp-tts-setup.md)를 참고한다.

## GCP VM HTTPS 배포

운영 배포에서는 Caddy가 TLS 인증서 발급·갱신과 HTTP→HTTPS 리다이렉트를 담당합니다.
`GCP_VM_HOST`가 IPv4 주소이면 배포 워크플로가 자동으로
`https://<대시로 구분한 IP>.sslip.io` 주소를 사용하고, 도메인이면 해당 도메인을 그대로 사용합니다.

배포 전에 다음 외부 설정이 필요합니다.

1. Compute Engine VM에 고정 외부 IP를 사용합니다.
2. GCP 방화벽에서 TCP 80과 TCP 443 인바운드를 허용합니다.
3. Naver Cloud Platform Maps의 Web 서비스 URL에 최종 HTTPS 주소를 추가합니다.

예를 들어 VM 주소가 `203.0.113.10`이면 등록할 주소는 다음과 같습니다.

```text
https://203-0-113-10.sslip.io
```

인증서와 Caddy 상태는 Docker named volume에 보존되므로 일반 재배포 시 다시 초기화되지 않습니다.
