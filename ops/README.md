# CampusTour 운영 관측

`ops-agent-config.yaml`은 Compute Engine VM의 기본 Ops Agent 설정에 Docker
컨테이너 로그 수집만 추가한다. 기본 host metrics와 system log pipeline은
그대로 유지한다.

운영 알림의 최소 범위:

- 공개 `https://34-50-31-235.sslip.io/api/health/network` HTTPS 점검
- 2분 이상 연속 실패 시 이메일 알림
- VM 메모리 사용률 85%가 5분 이상 지속될 때 알림
- VM 파일시스템 중 하나라도 사용률 80%가 5분 이상 지속될 때 알림
- Docker 컨테이너 로그를 Cloud Logging으로 수집하여 장애 원인 조회 지원

알림 채널은 Cloud Monitoring에서 관리하며 저장소에는 이메일 주소나 리소스
ID를 하드코딩하지 않는다.

CPU 순간 사용률과 로그 문자열 기반 경보는 현재 구성에서 제외한다. 배포나
일시적인 요청 증가가 곧바로 알림으로 이어지는 것을 피하고, 실제 서비스 장애는
외부 Uptime 점검으로 탐지한다.

## 긴급 확인 순서

1. `curl -fsS https://34-50-31-235.sslip.io/api/health/network`로 외부 응답을 확인한다.
2. VM에서 `docker compose ps`와 `docker stats --no-stream`을 확인한다.
3. `journalctl -u google-cloud-ops-agent --since "15 minutes ago"`로 Agent 상태를 확인한다.
4. Cloud Logging에서 VM 이름과 장애 시각으로 Docker 로그를 조회한다.

Ops Agent 설정을 변경하기 전에는 `/etc/google-cloud-ops-agent/config.yaml`을
백업하고, 다음 명령으로 검증한 뒤 Agent만 재시작한다. Agent 재시작은
애플리케이션 컨테이너를 재시작하지 않는다.

```bash
sudo /opt/google-cloud-ops-agent/libexec/google_cloud_ops_agent_engine \
  -in /etc/google-cloud-ops-agent/config.yaml
sudo systemctl restart google-cloud-ops-agent
```
