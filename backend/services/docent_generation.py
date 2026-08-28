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
DISALLOWED_FINANCIAL_DETAIL = re.compile(
    r"(?:총\s*)?사업비|공사비|건립비|예산|\d+(?:[.,]\d+)?\s*억\s*원"
)

SUPPORTED_LANGUAGES = ["ko", "en", "ja", "zh"]

LANGUAGE_NAMES = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Simplified Chinese",
}

LOCALE_CODES = {
    "ko": "ko-KR",
    "en": "en-US",
    "ja": "ja-JP",
    "zh": "cmn-CN",
}


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


def generation_prompt(spec: DocentSpec, phase: str = "arrival", language: str = "ko") -> str:
    if phase not in {"en_route", "arrival"}:
        raise ValueError(f"unsupported docent phase: {phase}")

    if language == "ko":
        phase_direction = (
            """이동 중 대본입니다. 청자는 아직 목적지에 도착하지 않았습니다.
'지금 가고 있는 곳은', '도착하기 전에 먼저 소개해 드리면'처럼 이동 중임을 분명히 하세요.
'눈앞에', '지금 보이는', '도착한 곳은', '여기에서'처럼 이미 현장에 있는 표현은 쓰지 마세요.
첫 장소인 신정문이라면 첫 문장을 반드시 '전북대학교에 오신 여러분, 환영합니다.'로 시작하세요."""
            if phase == "en_route"
            else f"""현장 대본입니다. 청자는 목적지 20미터 안에 도착했습니다.
눈앞의 형태나 주변을 직접 살펴보도록 유도하고, 이동 중이라고 말하지 마세요.
반드시 첫 문장을 그대로 사용하세요: {spec.opening_line}"""
        )
        minimum_chars = max(60, round(spec.target_duration_seconds * 2.2))
        maximum_chars = min(500, round(spec.target_duration_seconds * 6.0))
        return f"""당신은 전북대학교 캠퍼스의 한국어 음성 도슨트 대본을 작성합니다.
아래 데이터만 사실의 근거로 사용하고 제공되지 않은 수치·인물·시설·인과관계를 추가하지 마세요.
이 작업의 목적은 사실 목록을 읽어 주는 것이 아니라, 처음 온 후배와 캠퍼스를 함께
걸으며 장소를 보여 주고 다음 경험으로 이끄는 실제 투어를 진행하는 것입니다.

장소: {spec.label}
대본 단계: {phase}
{phase_direction}
목표 낭독 시간: {spec.target_duration_seconds}초
필수 사실: {json.dumps(_fact_payload(spec.required_facts), ensure_ascii=False)}
선택 사실: {json.dumps(_fact_payload(spec.optional_facts), ensure_ascii=False)}

규칙:
1. 필수 사실을 모두 자연스럽게 포함하세요.
2. 선택 사실은 흐름에 맞는 항목을 최대 2개만 사용하세요.
3. 개별 fact를 한 문장씩 순서대로 옮기지 마세요. 서로 관련된 사실을 묶고 자연스러운
   연결어를 사용해 하나의 이야기처럼 이어 말하세요.
4. 이동 중에는 도착 후 해 볼 일을 기대하게 하고, 현장에서는 눈앞의 장소를 관찰하도록
   유도하세요. 짧은 질문, 공감 표현, 방문·사진·산책·이용 제안 중 어울리는 표현을
   1~2회 넣어 후배의 호응을 유도하되 새로운 사실을 만들지 마세요.
5. 학교를 좋아하는 선배의 애정과 설렘이 느껴지는 해요체를 사용하세요. 안내방송,
   백과사전, 보고서처럼 딱딱하게 쓰거나 과한 광고 문구를 반복하지 마세요.
6. 마지막에는 방금 본 장소의 인상을 정리하거나 다음 이동을 기대하게 하는 짧은 연결
   문장을 넣으세요.
7. 사업비, 공사비, 건립비, 예산 등 금액 정보는 입력 사실에 있더라도 절대 말하지 마세요.
8. TTS가 읽기 쉬운 짧은 문장을 사용하고 괄호·마크다운·이모지를 쓰지 마세요.
9. 첫 문장을 제외한 표현은 바꿀 수 있지만, 실제로 사용하는 사실의 숫자와 고유명사는
   원문을 보존하세요.
10. 공백과 문장부호를 포함한 전체 대본 길이는 반드시 {minimum_chars}자 이상
    {maximum_chars}자 이하로 작성하세요. 반환하기 전에 글자 수를 확인하고, 초과하면
    반복되는 수식어와 선택 사실부터 줄이세요.
11. JSON만 반환하세요.

반환 형식:
{{"script":"전체 대본", "usedFactIds":["실제로 사용한 모든 factId"]}}
"""

    # --- Non-Korean languages ---
    target_language = LANGUAGE_NAMES.get(language, "English")
    if phase == "en_route":
        phase_direction = (
            f"EN-ROUTE script: the listener has NOT yet arrived. "
            f"Clearly indicate movement with phrases like 'We're heading to...' or 'Before we arrive, let me introduce...'. "
            f"Do NOT use phrases like 'As you can see in front of you' or 'Here we are'. "
            f"If this is the very first stop (Sinjungmun Gate), start the very first sentence with a welcome greeting to Jeonbuk National University."
        )
    else:
        phase_direction = (
            f"ON-SITE script: the listener has arrived within 20 meters of the destination. "
            f"Invite them to observe what's in front of them. Do NOT imply they are still walking."
        )

    minimum_chars = max(60, round(spec.target_duration_seconds * 2.2))
    maximum_chars = min(500, round(spec.target_duration_seconds * 6.0))
    return f"""You are writing a {target_language} audio docent script for a campus tour at Jeonbuk National University (JBNU), South Korea.
Use ONLY the facts provided below. Do not invent numbers, people, facilities, or causal relationships not listed.
The goal is not to recite a fact list but to conduct a real walking tour — showing a first-time visitor around campus like a warm, proud senior student would.

Location: {spec.label}
Phase: {phase}
{phase_direction}
Target speaking duration: {spec.target_duration_seconds} seconds
Required facts: {json.dumps(_fact_payload(spec.required_facts), ensure_ascii=False)}
Optional facts: {json.dumps(_fact_payload(spec.optional_facts), ensure_ascii=False)}

Rules:
1. Include ALL required facts naturally.
2. Use at most 2 optional facts that fit the flow.
3. Do NOT recite facts one by one. Group related facts and weave them into a single cohesive story with natural transitions.
4. During en-route, build anticipation for what to do upon arrival. On-site, encourage observation. Use 1–2 short questions, empathetic remarks, or visit/photo/stroll suggestions — without inventing new facts.
5. Write in the warm, friendly tone of a proud senior who loves the school. Avoid stiff announcements, encyclopedia entries, or repetitive promotional language.
6. End with a short sentence that wraps up the impression of the place or builds excitement for what comes next.
7. NEVER mention construction costs, project budgets, or specific monetary figures even if present in the facts.
8. Use short, TTS-friendly sentences. No parentheses, markdown, or emoji.
9. Preserve all numbers and proper nouns from the source facts exactly as given (Korean place names may remain in Korean if transliteration is ambiguous for navigation).
10. The total script length (including spaces and punctuation) MUST be between {minimum_chars} and {maximum_chars} characters. Verify the count before returning and trim optional adjectives or optional facts if over the limit.
11. Return JSON only.

Return format:
{{"script": "full script in {target_language}", "usedFactIds": ["every factId actually used"]}}
"""


def review_prompt(spec: DocentSpec, script: str, phase: str = "arrival", language: str = "ko") -> str:
    if language == "ko":
        return f"""다음 캠퍼스 도슨트 대본을 제공된 사실만으로 엄격히 검수하세요.
단순한 연결 표현은 허용하지만 제공되지 않은 구체적인 사실·수치·인물·시설은 허용하지 않습니다.
`verified=false`는 학생 경험·추천·감상처럼 외부 출처 검증 대상이 아닌 편집
인사이트라는 뜻입니다. 제공된 사실 목록에 있다면 허용하며, 이 값만을 이유로
unsupported claim으로 판정하지 마세요.
대본이 사실을 하나씩 낭독하지 않고 실제 투어처럼 자연스럽게 이어지는지, 후배에게
관찰이나 경험을 권하는 호응 유도 표현이 있는지도 검수하세요. 사업비, 공사비, 건립비,
예산 또는 구체적인 건설 금액이 들어 있으면 승인하지 마세요.

장소: {spec.label}
대본 단계: {phase}
대본: {script}
허용된 사실: {json.dumps(_fact_payload(spec.all_facts), ensure_ascii=False)}
필수 factId: {json.dumps([fact['factId'] for fact in spec.required_facts], ensure_ascii=False)}

JSON만 반환하세요:
{{"approved":true, "coveredRequiredFactIds":["대본에 의미상 포함된 필수 factId"], "unsupportedClaims":[], "tourLike":true, "engagementPresent":true, "phaseCompatible":true, "financialDetailPresent":false}}
"""
    target_language = LANGUAGE_NAMES.get(language, "English")
    return f"""Review the following {target_language} campus docent script strictly against the provided facts only.
Simple transitional phrases are allowed, but do NOT permit specific facts, numbers, people, or facilities not listed.
`verified=false` means the fact is an editorial insight (student experience, recommendation, impression) — not externally verified.
It is still an allowed fact if it appears in the list. Do NOT flag it as an unsupported claim solely because verified=false.
Also check whether the script flows like a real tour (not a list recitation) and whether it invites the listener to observe or engage.
Never approve a script that mentions construction costs, project budgets, or specific monetary figures.

Location: {spec.label}
Phase: {phase}
Script: {script}
Allowed facts: {json.dumps(_fact_payload(spec.all_facts), ensure_ascii=False)}
Required factIds: {json.dumps([fact['factId'] for fact in spec.required_facts], ensure_ascii=False)}

Return JSON only:
{{"approved":true, "coveredRequiredFactIds":["required factIds semantically covered"], "unsupportedClaims":[], "tourLike":true, "engagementPresent":true, "phaseCompatible":true, "financialDetailPresent":false}}
"""


def deterministic_errors(
    spec: DocentSpec,
    script: str,
    used_fact_ids: list[str],
    phase: str = "arrival",
    language: str = "ko",
) -> list[str]:
    errors: list[str] = []
    clean_script = normalize_text(script)
    required_ids = {fact["factId"] for fact in spec.required_facts}
    optional_ids = {fact["factId"] for fact in spec.optional_facts}
    used_ids = set(used_fact_ids)
    # Korean-only checks
    if language == "ko":
        if phase == "arrival" and not clean_script.startswith(normalize_text(spec.opening_line)):
            errors.append("opening line is missing or changed")
        if phase == "en_route" and re.search(r"눈앞에|지금\s*보이|도착한\s*곳|지금\s*도착", clean_script):
            errors.append("en-route script speaks as if already at the destination")
        if phase == "en_route" and spec.entity_id == "tour_01_new_gate" and not clean_script.startswith(
            "전북대학교에 오신 여러분, 환영합니다."
        ):
            errors.append("first en-route script is missing the welcome line")
        if DISALLOWED_FINANCIAL_DETAIL.search(clean_script):
            errors.append("disallowed financial detail is present")
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
    # Number check: only for Korean (numbers in Korean facts may appear differently in other languages)
    if language == "ko":
        for fact in spec.required_facts:
            for number in NUMBER_TOKEN.findall(fact["content"]):
                if number not in clean_script:
                    errors.append(f"required number {number!r} from {fact['factId']} is missing")
    return errors


def generate_and_validate(
    spec: DocentSpec,
    llm: Any,
    phase: str = "arrival",
    language: str = "ko",
) -> tuple[str, list[str]]:
    generated = _json_content(llm.invoke(generation_prompt(spec, phase, language)))
    script = normalize_text(str(generated.get("script", "")))
    used_fact_ids = generated.get("usedFactIds", [])
    if not isinstance(used_fact_ids, list) or not all(isinstance(value, str) for value in used_fact_ids):
        raise ValueError("usedFactIds must be an array of strings")
    errors = deterministic_errors(spec, script, used_fact_ids, phase, language)
    if errors:
        raise ValueError("; ".join(errors))

    review = _json_content(llm.invoke(review_prompt(spec, script, phase, language)))
    covered = review.get("coveredRequiredFactIds", [])
    required_ids = {fact["factId"] for fact in spec.required_facts}
    if review.get("approved") is not True:
        errors.append("semantic reviewer did not approve the script")
    if review.get("tourLike") is not True:
        errors.append("semantic reviewer found the script is not tour-like")
    if review.get("engagementPresent") is not True:
        errors.append("semantic reviewer found no engagement expression")
    if review.get("phaseCompatible") is not True:
        errors.append("semantic reviewer found the script incompatible with its tour phase")
    if review.get("financialDetailPresent") is not False:
        errors.append("semantic reviewer found financial detail")
    if not isinstance(covered, list) or not required_ids.issubset(set(covered)):
        errors.append("semantic reviewer found missing required facts")
    unsupported = review.get("unsupportedClaims", [])
    if not isinstance(unsupported, list) or unsupported:
        errors.append(f"semantic reviewer found unsupported claims: {unsupported}")
    if errors:
        raise ValueError("; ".join(errors))
    return script, used_fact_ids
