# AI Campus Tour 프로젝트 기술 보고서

작성일: 2026-08-24

## 1. 프로젝트 개요

AI Campus Tour는 전북대학교 방문자와 학생을 위한 모바일 캠퍼스 안내 서비스다. 사용자의 실시간 위치와 이동 수단을 기반으로 캠퍼스 길찾기, 주변 시설 검색, AI 도슨트, 다국어 음성 안내를 제공한다.

일반 지도 서비스가 다루기 어려운 교내 보행로, 건물 출입구, 층·호실·편의시설 관계를 자체 데이터로 구축했다. Neo4j 지식 그래프, GeoJSON 공간 데이터, 생성형 AI를 결합해 단순 최단경로를 넘어 캠퍼스 상황에 맞는 안내를 제공하는 것이 핵심이다.

## 2. 주요 기능

- 캠퍼스 건물·시설·부서·호실 통합 검색
- 도보·자전거·자동차별 길안내
- 캠퍼스 보행로 기반 최적 경로 생성
- 위치와 주변 POI를 반영한 AI 도슨트 안내
- 한국어·영어·일본어·중국어 음성 안내
- 음성 우선순위 제어 및 다음 안내 사전 로딩
- 네트워크·GPS 불안정 시 텍스트 안내 유지

## 3. 기술 스택

| 구분 | 주요 기술 | 사용 목적 |
|---|---|---|
| Frontend | Next.js 15, React 19, TypeScript | 모바일 UI와 API 연동 |
| 지도 | Naver Maps, GPS, DeviceOrientation | 지도·현재 위치·방향 표시 |
| Backend | FastAPI, Python 3.12 | 캠퍼스·경로·AI·TTS API |
| AI | Gemini, LangChain, YAML Prompt | 상황 기반 다국어 안내 생성 |
| Database | Neo4j | 건물·시설·층·호실 관계 저장 |
| Routing | NetworkX, GeoJSON | 캠퍼스 보행 경로 계산 |
| GCP | Compute Engine, Cloud TTS, Cloud Storage | 서버 운영, 음성 합성·캐시 |
| 운영 | Docker Compose, Caddy, GitHub Actions | 배포 자동화와 HTTPS |
| 관측 | Ops Agent, Cloud Logging, Monitoring | 로그·자원·가용성 감시 |

## 4. 시스템 구조

```text
모바일 브라우저
  └─ Next.js / Naver Maps / GPS / Audio
                    │ HTTPS
                    ▼
GCP Compute Engine
  ├─ Caddy: HTTPS 및 reverse proxy
  ├─ Next.js: 화면과 API proxy
  ├─ FastAPI: 경로·AI·TTS API
  └─ Neo4j: 캠퍼스 지식 그래프
          ├─ Gemini / Cloud TTS
          ├─ Cloud Storage 음성 캐시
          └─ Cloud Logging / Monitoring
```

## 5. 핵심 기술

### 지식 그래프와 경로 탐색

Neo4j에는 건물, 층, 호실, 편의시설, 부서, 투어 지점을 관계 중심으로 저장한다. 실제 이동 경로는 캠퍼스 보행로 GeoJSON을 NetworkX 그래프로 변환해 계산한다. 차도에 높은 가중치를 적용하고 보행로를 우선하며, 이미 지나온 길의 반복도 줄였다. 고정 투어 경로는 미리 계산해 응답시간과 CPU 사용량을 절감한다.

### Graph RAG 기반 AI 안내

현재 위치, 다음 목적지, 주변 POI를 Gemini에 전달해 구간별 설명을 생성한다. 동일한 조건의 결과는 캐시해 중복 호출을 줄이고, 생성 실패 시 기본 다국어 문구를 제공해 길안내 기능은 유지한다.

### 통합 음성 안내

앱 전체가 하나의 오디오 재생기와 우선순위 큐를 공유한다. 회전 안내가 도슨트 설명보다 우선하며, 다음 안내를 미리 받아 지연을 줄인다. 네트워크나 TTS 장애 시에도 지도와 텍스트 안내는 계속 제공된다.

## 6. GCP 활용과 효율화

### Compute Engine

Next.js, FastAPI, Neo4j, Caddy를 Docker Compose로 한 VM에서 운영한다. 영속 저장이 필요한 Neo4j에 적합하며 현재 규모에서 비용과 관리 복잡도를 줄인다. Neo4j 메모리 상한을 설정해 4GB급 VM의 OOM 위험을 낮추고 관리 포트는 외부에 공개하지 않았다.

### Cloud Text-to-Speech

Gemini-TTS로 기기와 OS에 관계없이 일관된 음성 품질을 제공한다. 길안내, 도착, 도슨트별 말투를 구분하며 `gemini-2.5-flash-tts`를 사용해 품질·비용·속도의 균형을 맞췄다.

### Cloud Storage

생성한 MP3를 private bucket에 저장한다. 문장, 언어, 화자, 스타일, 모델 버전을 해시로 만들어 같은 음성을 다시 합성하지 않는다. 이 방식은 TTS 비용과 재생 대기시간을 줄이며, 동적 음성에는 30일 수명 주기를 적용해 저장 비용을 제어한다.

### IAM과 보안

VM 서비스 계정과 Application Default Credentials를 사용하므로 서비스 계정 키를 저장소에 넣지 않는다. TTS와 Storage에는 최소 권한만 부여하고, 음성 API에는 출처 검사, 입력 크기와 요청 횟수 제한을 적용했다.

### Logging과 Monitoring

Ops Agent로 VM 자원과 Docker 로그를 Cloud Logging에 수집한다. Cloud Monitoring은 외부 HTTPS 상태, 메모리, 디스크를 감시한다. TTS의 캐시 적중 여부와 처리시간도 기록해 비용과 성능 병목을 분석할 수 있다.

## 7. 배포 및 최적화

GitHub Actions는 main 브랜치 변경 시 GCP VM에 자동 배포한다. 이미지 빌드, Neo4j 비파괴 데이터 적재, 서비스 기동, Backend·Frontend와 외부 HTTPS 상태 확인까지 자동 수행한다. Caddy는 인증서를 자동 발급·갱신한다.

주요 최적화는 다음과 같다.

- 고정 투어 경로와 AI 결과 캐시
- 콘텐츠 해시 기반 TTS 중복 합성 방지
- 고정 음성 사전 생성 및 변경된 자산만 갱신
- 다음 음성 최대 3개 prefetch
- 브라우저 오디오 캐시를 32개·50MB로 제한
- 네트워크 저속 시 동적 TTS 요청 차단
- Neo4j 메모리 제한으로 소형 VM 안정성 확보

## 8. 현재 상태와 향후 과제

캠퍼스 검색, 경로 탐색, 다국어 안내, 공용 음성 큐, GCP TTS·Storage 연동 코드, 자동 HTTPS 배포, 운영 로그 설정까지 구현됐다. Frontend build와 TypeScript 검사, Backend 단위 테스트 14개, Docker 구성과 음성 manifest 검증도 완료했다.

남은 주요 과제는 다음과 같다.

- GCP TTS API, Storage bucket, IAM, 예산 알림 최종 설정
- 주요 투어 지점의 검수된 다국어 도슨트 원문 작성
- iOS Safari와 Android Chrome 실기기 테스트
- Secret Manager 적용과 운영 CORS 제한
- Neo4j 정기 백업 및 복구 절차 마련
- 캐시 적중률, 음성 지연, 투어 완주율 등 KPI 측정

## 9. 결론

AI Campus Tour는 Neo4j의 관계 정보, NetworkX의 공간 경로, Gemini의 상황별 설명, GCP의 음성·저장·운영 기능을 하나의 이동 경험으로 통합한 프로젝트다.

Compute Engine은 현재 규모에서 상태 저장형 서비스를 경제적으로 운영하게 하고, Gemini-TTS는 음성 품질을 표준화한다. Cloud Storage 캐시는 반복 비용과 지연을 줄이며, Cloud Logging과 Monitoring은 단일 VM의 운영 위험을 보완한다. 향후 사용량이 증가하면 Next.js와 FastAPI를 Cloud Run으로 분리해 자동 확장 구조로 발전시킬 수 있다.

보고서에는 아키텍처 다이어그램, Neo4j 데이터 모델, GCP 비용 추정, 실기기 테스트 결과를 부록으로 추가하면 기술적 설득력을 더 높일 수 있다.
