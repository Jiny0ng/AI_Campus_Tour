# 공용 GCP TTS 구현 상태 및 계획 대조

기준 문서: `shared-gcp-tts-implementation-plan.md` (2026-08-23 확정안)

## 구현 완료

- FastAPI 공용 `/tts/synthesize`, `/tts/assets/{asset_id}`, `/health/network`
- Gemini TTS용 ADC 클라이언트와 private GCS 오디오 캐시
- 입력 정규화, hash, timeout, token bucket, 구조화 로그
- 콘텐츠 CSV, manifest 검증, 기본 dry-run 사전 생성 스크립트
- 검수 원문이 있는 주변 `docent_spot` 12개의 사전 asset 생성·재생 경로
- Next.js 오디오 streaming proxy
- 앱 전체 단일 `HTMLAudioElement`, 우선순위 큐, 150ms 선점, 중복 방지
- 세션 LRU 32개/50MB와 object URL 회수
- 다국어 규칙 기반 9종 maneuver 및 6개 거리 버킷
- 자동차 다음 안내 3개 prefetch와 도보·자전거 좌표 기반 회전 안내
- 투어 다음 장소 prefetch, 도착 1회 재생, GPS 정확도 30m 초과 시 수동 도착 확인
- 상세 팁과 주변 도슨트 스팟의 사용자 요청 재생
- 네트워크 상태 머신, text-only 강등, 저속 상태 신규 동적 TTS 차단
- guest Wi-Fi 설정 및 안전한 자동 노출 조건 (`enabled=false` 기본값)
- 구조화된 세션 도슨트·팁·도착 장소 리포트
- 환경변수, Docker, 런타임 진단, 배포 health smoke test

## 계획과 다르게 처리한 사항

### 1. 핵심 투어 도슨트 asset은 아직 생성하지 않음

현재 `campus_places.csv`의 12개 `tour_stop`에는 검수된 `docent_text`가 없다. 계획대로 LLM으로 임의 보충하지 않고 생성 스크립트가 누락을 오류로 보고하도록 했다. 원문이 없는 동안 화면의 구간 팁/설명을 `location-docent`로 합성해 30일 캐시 정책을 적용하고, 검수 원문이 추가되면 같은 코드가 `core-docent` 사전 asset을 사용한다.

### 2. GCP bucket/IAM/Lifecycle은 코드에서 생성하지 않음

현재 작업 환경에는 운영 프로젝트 권한과 확정 버킷명이 없다. 외부 리소스를 추측해 변경하지 않고 설정 문서, 환경변수, ADC·버킷 진단, dry-run/apply 파이프라인을 준비했다. 실제 활성화에는 `gcp-tts-setup.md`의 운영 작업이 필요하다.

### 3. 로컬 시스템 MP3는 apply 시 생성

가짜 또는 다른 엔진의 음성을 저장소에 넣지 않기 위해 현재 빈 MP3를 추가하지 않았다. 승인된 `--apply` 실행 시 GCP와 동일한 시스템 음성을 `frontend/public/audio/system/`에 함께 기록한다.

### 4. 차량 모드 주변 시설 도슨트 자동 재생 차단

계획의 우선순위만으로도 충돌은 막을 수 있지만, 운전자 주의 분산 가능성을 더 낮추기 위해 차량에서는 주변 시설 설명을 화면에만 표시한다. 회전·도착과 목적지 핵심 정보는 유지한다.

### 5. filler는 인터페이스와 콘텐츠 파이프라인만 구현

이번 범위에는 Q&A UI가 없으므로 실제 재생 트리거를 제품 화면에 연결하지 않았다. CSV, 가중치 선택기, 최근 3개 제외 로직, 공용 `filler` category는 준비되어 있어 Q&A 추가 시 재사용할 수 있다.

### 6. 사전 asset은 임시 object 복사 대신 content hash 경로에 직접 업로드

계획서의 임시 object → 최종 object 복사 대신, 단일 MP3를 content hash가 포함된 새 경로에 한 번 업로드하고 성공한 뒤에만 manifest를 갱신한다. GCS 업로드 실패 시 manifest가 해당 object를 가리키지 않고 기존 hash object도 덮어쓰지 않는다. 별도 복사·삭제 권한과 요청을 늘리지 않으면서 같은 실패 격리 효과를 얻기 위한 변경이다. 부작용 점검 결과 실패 시 manifest 미갱신으로 다음 실행에서 동일 항목을 재시도하며, 성공한 hash object의 중복 생성 여부는 기존 manifest 비교로 방지된다.

### 7. 도보·자전거 회전 음성은 180m 대신 40m에서 재생

180m 임계값은 기존 자동차 안내에는 그대로 적용했다. 새로 추가한 도보·자전거 안내에 같은 값을 적용하면 사용자가 회전 지점에 도달하기 수 분 전에 음성을 듣게 되므로 40m로 분리했다. 경로를 받는 즉시 다음 안내 3개를 미리 받아 합성 대기시간은 숨기며, 40m는 재생 시점만 늦춘다. 부작용으로 GPS 오차가 큰 환경에서 반응 여유가 줄 수 있어 도보·자전거 안내 만료시간을 30초로 제한하고 화면의 거리·방향 텍스트는 계속 즉시 갱신한다.

## 남은 외부 작업

1. GCP API, bucket, Lifecycle, IAM, 예산 알림 구성
2. 12개 투어 정류장의 언어별 검수 도슨트 원문 작성
3. 승인된 `generate_audio_assets.py --apply` 실행과 manifest/로컬 시스템 음성 검토
4. 실제 교내 guest Wi-Fi 정보를 검증한 뒤 `campusWifi.enabled=true` 전환
5. iOS Safari와 Android Chrome에서 GPS·저속·자동재생 인수 테스트

## 최종 검증 결과

- 프론트엔드 `npm run build`, `npx tsc --noEmit` 통과
- 최종 백엔드 Docker 이미지 빌드 및 이미지 내부 단위 테스트 14개 통과
- Gemini TTS 클라이언트의 `prompt`, `model_name` 필드와 FastAPI 앱 import 확인
- 사전 생성 dry-run: 관리 asset 228개, 변경 예정 228개, 비정상 항목은 원문이 없는 `tour_stop` 12개만 보고
- 빈 manifest 구조 검증, `docker compose config --quiet`, `git diff --check` 통과
- 로컬 브라우저에서 홈·안내·투어 화면과 음성 실패 시 텍스트 유지 확인
- `SpeechSynthesis` 잔존 호출 0개, 앱 전역 `HTMLAudioElement` 생성 지점 1개 확인

실제 GCP 합성·GCS cache hit, 생성 음성 품질, 모바일 자동재생과 GPS 임계값은 운영 ADC·버킷·검수 콘텐츠 및 실제 기기가 필요한 외부 인수 항목이라 이번 로컬 검증에는 포함하지 않았다.
