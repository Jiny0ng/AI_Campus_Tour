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

`--apply`는 TTS 비용과 GCS 쓰기를 발생시킨다. 운영에서는 `.github/workflows/refresh-audio-assets.yml`가 약 2주 간격(매월 2일·16일 03:00 KST)에 이를 실행한다. 콘텐츠 해시가 같은 항목은 다시 합성하지 않으므로, 일정 실행 자체가 비용이나 음성 변경을 만들지 않는다. 학교 상황을 반영하려면 먼저 `campus_places.csv`의 검수된 `docent_text` 또는 고정 문구 CSV를 수정·배포해야 한다.

이 작업은 `audio-asset-generator` 전용 컨테이너로 실행된다. 일반 backend는 계속 `campusdata`를 읽기 전용으로 사용하고, 생성 작업만 manifest와 시스템 음성 폴더에 쓸 수 있다. 시스템 음성은 GCS와 함께 `frontend/public/audio/system/`에도 기록된다.

현재 메인 투어 `tour_stop` 12개에는 검수된 `docent_text`가 비어 있다. 내용을 임의 생성하지 않으므로 이 항목들은 생성 대상에서 제외되며, 각 행의 `docent_text`를 채워 main에 배포하면 다음 자동 실행(또는 수동 실행)에서 `core-docent:<place-id>:ko` 자산으로 생성된다.

## 배포 확인

- `GET /health/network`가 빠르게 `status=ok`를 반환해야 한다.
- `runtime_diagnostics.py`에서 ADC와 버킷 metadata read가 성공해야 한다.
- manifest에 asset이 있다면 샘플 객체가 실제 버킷에 존재해야 한다.
- TTS 실패 상황에서도 지도, 경로, 도착 판정과 텍스트 안내가 유지되어야 한다.
