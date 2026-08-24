"""Generate and validate docent scripts from canonical fact/config CSV data."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from services.tts_service import normalize_text


JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)
NUMBER_TOKEN = re.compile(r"\d+(?:[.,]\d+)?")


@dataclass(frozen=True)
class DocentSpec:
    entity_id: str
    label: str
    opening_line: str
    target_duration_seconds: int
    required_facts: tuple[dict[str, Any], ...]
    optional_facts: tuple[dict[str, Any], ...]

    @property
    def all_facts(self) -> tuple[dict[str, Any], ...]:
        return self.required_facts + self.optional_facts


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [dict(row) for row in csv.DictReader(file)]


def load_docent_specs(data_dir: Path) -> list[DocentSpec]:
    places = {row["id"]: row for row in _read_csv(data_dir / "campus_places.csv")}
    facts = _read_csv(data_dir / "campus_facts.csv")
    facts_by_id = {
        row["fact_id"]: {
            "factId": row["fact_id"],
            "category": row["category"],
            "content": row["content"],
            "importance": int(row["importance"]),
            "verified": row["verified"].lower() == "true",
        }
        for row in facts
    }
    specs: list[DocentSpec] = []
    for config in _read_csv(data_dir / "campus_docents.csv"):
        if config.get("enabled", "true").lower() != "true":
            continue
        entity_id = config["entity_id"]
        required_ids = [value for value in config["required_fact_ids"].split("|") if value]
        optional_ids = [value for value in config["optional_fact_ids"].split("|") if value]
        specs.append(
            DocentSpec(
                entity_id=entity_id,
                label=places[entity_id]["name"],
                opening_line=config["opening_line"],
                target_duration_seconds=int(config["target_duration_seconds"]),
                required_facts=tuple(facts_by_id[value] for value in required_ids),
                optional_facts=tuple(facts_by_id[value] for value in optional_ids),
            )
        )
    return specs


def content_fingerprint(spec: DocentSpec, model: str, prompt_version: str) -> str:
    payload = {
        "entityId": spec.entity_id,
        "label": spec.label,
        "openingLine": spec.opening_line,
        "targetDurationSeconds": spec.target_duration_seconds,
        "requiredFacts": spec.required_facts,
        "optionalFacts": spec.optional_facts,
        "model": model,
        "promptVersion": prompt_version,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _json_content(response: Any) -> dict[str, Any]:
    content = response.content if hasattr(response, "content") else response
    if isinstance(content, list):
        content = "".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    match = JSON_OBJECT.search(str(content))
    if not match:
        raise ValueError("model response did not contain a JSON object")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model response must be a JSON object")
    return parsed


def _fact_payload(facts: tuple[dict[str, Any], ...]) -> list[dict[str, Any]]:
    return [
        {
            "factId": fact["factId"],
            "content": fact["content"],
            "verified": fact["verified"],
        }
        for fact in facts
    ]


def generation_prompt(spec: DocentSpec) -> str:
    return f"""당신은 전북대학교 캠퍼스의 한국어 음성 도슨트 대본을 작성합니다.
아래 데이터만 사실의 근거로 사용하고 제공되지 않은 수치·인물·시설·인과관계를 추가하지 마세요.

장소: {spec.label}
목표 낭독 시간: {spec.target_duration_seconds}초
반드시 첫 문장 그대로 사용: {spec.opening_line}
필수 사실: {json.dumps(_fact_payload(spec.required_facts), ensure_ascii=False)}
선택 사실: {json.dumps(_fact_payload(spec.optional_facts), ensure_ascii=False)}

규칙:
1. 필수 사실을 모두 자연스럽게 포함하세요.
2. 선택 사실은 흐름에 맞는 항목을 최대 2개만 사용하세요.
3. 목록이 아니라 정체성→특징→이야기 또는 이용 팁 순서의 하나의 대본으로 작성하세요.
4. TTS가 읽기 쉬운 짧은 문장을 사용하고 괄호·마크다운·이모지를 쓰지 마세요.
5. 첫 문장을 제외한 표현은 바꿀 수 있지만 숫자와 고유명사는 원문을 보존하세요.
6. JSON만 반환하세요.

반환 형식:
{{"script":"전체 대본", "usedFactIds":["실제로 사용한 모든 factId"]}}
"""


def review_prompt(spec: DocentSpec, script: str) -> str:
    return f"""다음 캠퍼스 도슨트 대본을 제공된 사실만으로 엄격히 검수하세요.
단순한 연결 표현은 허용하지만 제공되지 않은 구체적인 사실·수치·인물·시설은 허용하지 않습니다.

장소: {spec.label}
대본: {script}
허용된 사실: {json.dumps(_fact_payload(spec.all_facts), ensure_ascii=False)}
필수 factId: {json.dumps([fact['factId'] for fact in spec.required_facts], ensure_ascii=False)}

JSON만 반환하세요:
{{"approved":true, "coveredRequiredFactIds":["대본에 의미상 포함된 필수 factId"], "unsupportedClaims":[]}}
"""


def deterministic_errors(
    spec: DocentSpec,
    script: str,
    used_fact_ids: list[str],
) -> list[str]:
    errors: list[str] = []
    clean_script = normalize_text(script)
    required_ids = {fact["factId"] for fact in spec.required_facts}
    optional_ids = {fact["factId"] for fact in spec.optional_facts}
    used_ids = set(used_fact_ids)
    if not clean_script.startswith(normalize_text(spec.opening_line)):
        errors.append("opening line is missing or changed")
    if not required_ids.issubset(used_ids):
        errors.append(f"required facts omitted from usedFactIds: {sorted(required_ids - used_ids)}")
    if used_ids - required_ids - optional_ids:
        errors.append(f"unknown usedFactIds: {sorted(used_ids - required_ids - optional_ids)}")
    if len(used_ids & optional_ids) > 2:
        errors.append("more than two optional facts were used")
    minimum_chars = max(60, round(spec.target_duration_seconds * 2.2))
    maximum_chars = min(500, round(spec.target_duration_seconds * 6.0))
    if not minimum_chars <= len(clean_script) <= maximum_chars:
        errors.append(
            f"script length {len(clean_script)} is outside {minimum_chars}..{maximum_chars} characters"
        )
    for fact in spec.required_facts:
        for number in NUMBER_TOKEN.findall(fact["content"]):
            if number not in clean_script:
                errors.append(f"required number {number!r} from {fact['factId']} is missing")
    return errors


def generate_and_validate(spec: DocentSpec, llm: Any) -> tuple[str, list[str]]:
    generated = _json_content(llm.invoke(generation_prompt(spec)))
    script = normalize_text(str(generated.get("script", "")))
    used_fact_ids = generated.get("usedFactIds", [])
    if not isinstance(used_fact_ids, list) or not all(isinstance(value, str) for value in used_fact_ids):
        raise ValueError("usedFactIds must be an array of strings")
    errors = deterministic_errors(spec, script, used_fact_ids)
    if errors:
        raise ValueError("; ".join(errors))

    review = _json_content(llm.invoke(review_prompt(spec, script)))
    covered = review.get("coveredRequiredFactIds", [])
    required_ids = {fact["factId"] for fact in spec.required_facts}
    if review.get("approved") is not True:
        errors.append("semantic reviewer did not approve the script")
    if not isinstance(covered, list) or not required_ids.issubset(set(covered)):
        errors.append("semantic reviewer found missing required facts")
    unsupported = review.get("unsupportedClaims", [])
    if not isinstance(unsupported, list) or unsupported:
        errors.append(f"semantic reviewer found unsupported claims: {unsupported}")
    if errors:
        raise ValueError("; ".join(errors))
    return script, used_fact_ids
