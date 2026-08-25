# CampusTour Frontend

CampusTour의 모바일 웹 UI와 브라우저 기능을 담당하는 Next.js 애플리케이션입니다. 화면 렌더링뿐 아니라 FastAPI로 요청을 전달하는 서버 측 API 프록시, 지도·위치·기기 방향 처리와 공용 음성 재생 상태도 이 패키지에서 관리합니다.

프로젝트 전체 실행과 배포 방법은 [루트 README](../README.md)를 먼저 참고하세요.

## 기술 스택

- Next.js 15 App Router
- React 19
- TypeScript 5
- Tailwind CSS 3
- Framer Motion
- Naver Maps JavaScript API
- HTML Audio API, Geolocation API, DeviceOrientation API

정확한 버전과 의존성은 `package.json`과 `package-lock.json`을 기준으로 합니다.

## 주요 화면

| 경로 | 역할 |
|---|---|
| `/` | 홈 및 서비스 선택 |
| `/map` | 캠퍼스 지도 |
| `/guide` | 캠퍼스 시설 검색과 안내 |
| `/guide/navigation` | 도보·자전거 길안내 |
| `/guide/transport` | 이동 수단 선택과 자동차 안내 |
| `/tour/setup` | 투어 설정 |
| `/tour` | AI 캠퍼스 투어 진행 |
| `/tour/summary` | 투어 결과 요약 |

`app/api/`의 Route Handler는 브라우저 요청을 FastAPI에 전달합니다. `NAVER_MAP_CLIENT_SECRET`, `GOOGLE_API_KEY` 같은 비밀값은 브라우저 코드에서 사용하지 않습니다.

## 디렉터리 구조

```text
frontend/
├── app/                     # 페이지, layout과 서버 측 API Route Handler
│   ├── api/                 # FastAPI 요청 프록시
│   ├── guide/               # 캠퍼스 안내·내비게이션 페이지
│   ├── map/                 # 캠퍼스 지도 페이지
│   └── tour/                # 투어 설정·진행·요약 페이지
├── components/
│   ├── Common/              # 버튼, 모달, 시트 등 공용 UI
│   ├── Guide/               # 검색, 시설 안내와 내비게이션 UI
│   ├── Home/                # 홈 화면 UI
│   ├── Layout/              # 모바일 셸과 하단 내비게이션
│   ├── Map/                 # Naver 지도 관련 컴포넌트
│   └── Tour/                # AI 투어와 투어 요약 UI
├── config/                  # 환경별 기능 설정
├── constants/               # 캠퍼스 상수와 앱 경로
├── contexts/                # 앱 설정과 AudioGuide 전역 상태
├── dummy/                   # 실제 API가 없는 화면의 개발용 fixture
├── lib/                     # API, 지도 경로, 네트워크와 음성 도메인 로직
│   └── audioGuide/          # 큐, 캐시, filler와 세션 리포트
├── locales/properNouns/     # 영어·일본어·중국어 캠퍼스 고유명사
├── public/audio/system/     # 장애 상황용 고정 시스템 음성
├── styles/                  # 전역 스타일
└── types/                   # 화면과 API 공유 TypeScript 타입
```

## 상태와 데이터 흐름

- `AppSettingsContext`는 언어, 접근성 및 앱 공통 설정을 관리합니다.
- `AudioGuideContext`는 앱 전체에서 하나의 오디오 재생 계층을 공유합니다.
- `lib/apiClient.ts`는 서버 측 FastAPI 요청의 공통 진입점입니다.
- `app/api/`는 브라우저가 백엔드 내부 주소와 비밀값을 알지 못하도록 요청을 중계합니다.
- `lib/audioGuide/`는 우선순위 큐, 네트워크 품질, 캐시, filler와 세션 리포트를 관리합니다.
- 캠퍼스 데이터의 기준은 `dummy/`가 아니라 백엔드와 `campusdata/`입니다. fixture를 운영 데이터로 사용하지 않습니다.

## 환경변수

로컬 단독 개발 시 `frontend/.env.local`을 사용합니다.

```env
API_BASE_URL=http://localhost:8001
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your-naver-map-client-id
```

| 변수 | 실행 위치 | 설명 |
|---|---|---|
| `API_BASE_URL` | Next.js 서버 | FastAPI 주소이며 브라우저에 공개하지 않습니다. |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 브라우저 | Naver Maps JavaScript API용 공개 클라이언트 ID입니다. |

Docker Compose에서는 `API_BASE_URL=http://backend:8000`이 자동으로 주입됩니다. 자동차 길찾기의 `NAVER_MAP_CLIENT_SECRET`은 루트 `.env`에서 백엔드에만 전달합니다.

`NEXT_PUBLIC_` 접두사가 붙은 값은 빌드 결과에 포함되어 브라우저에서 볼 수 있습니다. 비밀 키에는 이 접두사를 사용하지 않습니다.

## 로컬 개발

```bash
cd frontend
npm ci
npm run dev
```

개발 서버는 `http://localhost:4173`에서 실행됩니다. 백엔드를 함께 사용하려면 루트에서 Docker Compose를 실행하거나 `API_BASE_URL`이 가리키는 FastAPI를 별도로 실행해야 합니다.

## 빌드

```bash
npm run build
npm run start
```

프로덕션 Docker 이미지는 Node 22 Alpine 기반의 multi-stage build를 사용하며 Next.js `standalone` 결과만 실행 이미지에 포함합니다. 컨테이너 내부 포트는 `3000`입니다.

## 개발 원칙

- 페이지 파일은 화면 조합과 데이터 진입점에 집중하고 복잡한 UI는 기능별 컴포넌트로 분리합니다.
- 공용으로 재사용되는 도메인 로직은 `lib/`, 공유 모델은 `types/`에 둡니다.
- 클라이언트 컴포넌트에 서버 전용 환경변수나 외부 API 비밀 키를 전달하지 않습니다.
- 새 API 연동은 가능하면 `app/api/` 프록시를 거쳐 오류·타임아웃 처리를 일관되게 유지합니다.
- 모든 음성 기능은 공용 `AudioGuideContext`를 사용하며 별도의 `Audio` 객체를 화면마다 만들지 않습니다.
- 네트워크나 음성 실패 시에도 지도와 텍스트 안내가 유지되어야 합니다.
- 다국어 고유명사는 컴포넌트에 직접 쓰지 않고 `locales/properNouns/`에서 관리합니다.
- 임시 데이터는 `dummy/`에 두되 파일명에 목적을 드러내고 실제 API 연결 후 제거 여부를 검토합니다.

## 모바일 테스트 주의사항

- GPS와 DeviceOrientation은 HTTPS 또는 브라우저가 인정하는 안전한 로컬 환경이 필요합니다.
- iOS에서는 기기 방향 권한과 오디오 재생을 사용자 동작 이후에 요청해야 합니다.
- 위치 정확도가 낮은 환경에서는 자동 도착 판정 대신 수동 확인 동작도 함께 검증합니다.
- Naver Cloud Platform 콘솔의 Web 서비스 URL에 테스트 및 운영 주소를 등록해야 지도가 정상 표시됩니다.
