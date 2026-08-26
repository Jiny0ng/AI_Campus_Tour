# Gemini TTS 파라미터 영향도 실험

말투, 대본, 모델, 음색을 고정하고 수치 파라미터만 변경해 듣는 통제 실험입니다.

## 고정 조건

- 모델: `gemini-2.5-pro-tts`
- 음색: `Sulafat`
- 언어: `ko-KR`
- 말투: `friendly_senior`
- 대본: 모든 샘플에서 동일

## 실험 1: 운율

`speaking_rate` 3개 × `pitch` 3개 × `volume_gain_db` 3개로 총 27개입니다.

```bash
python backend/scripts/generate_tts_parameter_grid.py --experiment prosody
python backend/scripts/generate_tts_parameter_grid.py --experiment prosody --apply
```

평가할 때에는 자연스러움, 대화감, 명료도, 청취 피로도를 각각 1~5점으로 기록합니다. 음량이 큰 샘플을 더 자연스럽다고 오인하지 않도록 가능하면 재생 음량을 정규화해서 듣습니다.

## 실험 2: 출력 음질

운율을 `rate=0.98`, `pitch=0`, `volume=0`으로 고정하고 MP3·OGG Opus·LINEAR16 및 24kHz·44.1kHz를 비교합니다.

```bash
python backend/scripts/generate_tts_parameter_grid.py --experiment technical
python backend/scripts/generate_tts_parameter_grid.py --experiment technical --apply
```

기본 실행은 비용이 발생하지 않는 dry-run입니다. `--apply`를 붙인 경우에만 실제 Gemini TTS를 호출합니다. `pitch` 또는 특정 인코딩/샘플레이트가 Gemini 모델에서 거절될 가능성을 확인하려면 `--continue-on-error`를 함께 사용합니다.

## 2026-08-26 실행 결과

회사 GCP VM의 인증을 사용해 실제 생성했습니다.

- 운율 그리드: 27/27 성공
- 출력 음질 그리드: 5/6 성공
- 실패 조합: `OGG_OPUS + 44.1kHz` (`Failed to create audio encoder`)
- 생성된 오디오: 31개, 약 4.9 MiB
- 상세 조건과 생성 시간: [운율 manifest](gemini-2.5-pro-sulafat/manifest-prosody.json), [출력 음질 manifest](gemini-2.5-pro-sulafat/manifest-technical.json)

### 한 축씩 듣기

다른 값은 기준값 `rate=0.98`, `pitch=0`, `volume=0`으로 고정했습니다.

| 비교 축 | 낮음 | 기준 | 높음 |
|---|---|---|---|
| 속도 | [0.94](gemini-2.5-pro-sulafat/rate-0.94--pitch-0.0--volume-0.0--hz-24000--mp3.mp3) | [0.98](gemini-2.5-pro-sulafat/rate-0.98--pitch-0.0--volume-0.0--hz-24000--mp3.mp3) | [1.02](gemini-2.5-pro-sulafat/rate-1.02--pitch-0.0--volume-0.0--hz-24000--mp3.mp3) |
| 피치 | [-1.0](gemini-2.5-pro-sulafat/rate-0.98--pitch-m1.0--volume-0.0--hz-24000--mp3.mp3) | [0.0](gemini-2.5-pro-sulafat/rate-0.98--pitch-0.0--volume-0.0--hz-24000--mp3.mp3) | [+1.0](gemini-2.5-pro-sulafat/rate-0.98--pitch-p1.0--volume-0.0--hz-24000--mp3.mp3) |
| 음량 | [-2dB](gemini-2.5-pro-sulafat/rate-0.98--pitch-0.0--volume-m2.0--hz-24000--mp3.mp3) | [0dB](gemini-2.5-pro-sulafat/rate-0.98--pitch-0.0--volume-0.0--hz-24000--mp3.mp3) | [+2dB](gemini-2.5-pro-sulafat/rate-0.98--pitch-0.0--volume-p2.0--hz-24000--mp3.mp3) |

속도별 9개 샘플의 평균 길이는 `0.94 → 21.76초`, `0.98 → 20.71초`, `1.02 → 19.90초`였습니다. 피치와 음량은 발화 길이에 일관된 영향을 보이지 않았습니다. 자연스러움 영향은 위 대표 샘플을 블라인드로 듣고 평가해야 합니다.

주의할 점은 Gemini TTS 출력 자체에 실행별 변동이 있다는 것입니다. 작은 차이를 확정하려면 상위 2~3개 조합을 각각 세 번 이상 다시 생성해 반복 평가하는 것이 좋습니다.

## 선택된 운영 프리셋

2026-08-26 청취 검토 결과 `bubbly-proud-senior-v1`을 한국어 도슨트 운영 프리셋으로 선택했습니다.

| 항목 | 값 |
|---|---|
| 적용 스타일 | `core-docent`, `location-docent` |
| 언어 | `ko-KR` |
| 모델 | `gemini-2.5-pro-tts` |
| 음색 | `Sulafat` |
| 말투 | `bubbly_proud_senior` |
| 속도 | `1.08` |
| 피치 | `+4.0` |
| 음량 | `0dB` |
| 출력 | `LINEAR16`, 24kHz, mono WAV |
| 말끝 | 마지막 모음을 늘이지 않고 짧게 마무리 |

실제 운영 설정의 단일 기준은 `backend/services/tts_presets.py`입니다. 프리셋 ID와 모든 합성 파라미터가 캐시 해시에 포함되므로 설정을 바꾸면 기존 음성과 충돌하지 않는 새 자산으로 생성됩니다.
