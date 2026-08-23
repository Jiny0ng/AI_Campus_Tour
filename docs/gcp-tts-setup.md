# GCP 공용 TTS 운영 설정

애플리케이션 코드는 GCP 리소스가 없어도 지도와 텍스트 안내를 유지한다. 실제 음성을 활성화하려면 운영자가 아래 리소스를 준비해야 한다.

## 필요한 리소스

1. Cloud Text-to-Speech API를 활성화한다.
2. 운영 VM과 가까운 리전에 private Cloud Storage Standard 버킷을 만든다.
3. 버킷에서 Public Access Prevention과 Uniform bucket-level access를 활성화한다.
4. `cache/location-docent/` prefix의 객체를 생성 30일 후 삭제하는 Lifecycle 규칙을 설정한다.
5. Compute Engine VM 서비스 계정에 아래 최소 권한을 부여한다.
   - `roles/aiplatform.user`
   - `roles/serviceusage.serviceUsageConsumer`
   - 버킷 단위 `roles/storage.objectViewer`
   - 버킷 단위 `roles/storage.objectCreator`
6. 저장소나 이미지에 서비스 계정 JSON 키를 넣지 않고 VM의 Application Default Credentials를 사용한다.

## 환경변수

`.env.example`의 `GCP_PROJECT_ID`, `TTS_BUCKET_NAME`, `TTS_MODEL`, `TTS_VOICE_NAME`, `TTS_PROMPT_VERSION`, `TTS_REALTIME_ENABLED`를 운영 값으로 설정한다.

## 콘텐츠 검증과 생성

기본 명령은 외부 상태를 변경하지 않는 dry-run이다.

```bash
python backend/scripts/generate_audio_assets.py
python backend/scripts/validate_audio_manifest.py
```

현재 `tour_stop`에 검수된 `docent_text`가 없으면 dry-run은 누락을 오류로 보고한다. 다른 고정 asset만 먼저 생성해야 할 때 누락을 명시적으로 확인하고 다음과 같이 실행한다.

```bash
python backend/scripts/generate_audio_assets.py --allow-missing-core-docent --apply
```

`--apply`는 TTS 비용과 GCS 쓰기를 발생시키므로 승인된 수동 작업에서만 실행한다. 시스템 음성은 GCS와 함께 `frontend/public/audio/system/`에도 기록된다. 생성된 manifest와 로컬 시스템 음성은 콘텐츠 변경 사항으로 검토한 후 배포한다.

## 배포 확인

- `GET /health/network`가 빠르게 `status=ok`를 반환해야 한다.
- `runtime_diagnostics.py`에서 ADC와 버킷 metadata read가 성공해야 한다.
- manifest에 asset이 있다면 샘플 객체가 실제 버킷에 존재해야 한다.
- TTS 실패 상황에서도 지도, 경로, 도착 판정과 텍스트 안내가 유지되어야 한다.

