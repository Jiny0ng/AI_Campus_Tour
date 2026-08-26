from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.docent_generation import (  # noqa: E402
    DocentSpec,
    deterministic_errors,
    generate_and_validate,
    generation_prompt,
    review_prompt,
)


class FakeResponse:
    def __init__(self, payload):
        self.content = json.dumps(payload, ensure_ascii=False)


class FakeLlm:
    def __init__(self, payloads):
        self.payloads = iter(payloads)

    def invoke(self, _prompt):
        return FakeResponse(next(self.payloads))


def sample_spec() -> DocentSpec:
    return DocentSpec(
        entity_id="gate",
        label="정문",
        opening_line="이곳은 정문입니다.",
        target_duration_seconds=45,
        required_facts=(
            {
                "factId": "gate:year",
                "category": "history",
                "content": "2019년에 완공되었다.",
                "importance": 100,
                "verified": True,
            },
        ),
        optional_facts=(
            {
                "factId": "gate:night",
                "category": "experience",
                "content": "야경을 감상하기 좋다.",
                "importance": 50,
                "verified": False,
            },
        ),
    )


class DocentGenerationTests(unittest.TestCase):
    def test_generation_prompt_requires_a_guided_tour_and_excludes_costs(self):
        prompt = generation_prompt(sample_spec())

        self.assertIn("실제 투어를 진행", prompt)
        self.assertIn("호응을 유도", prompt)
        self.assertIn("금액 정보", prompt)
        self.assertIn("절대 말하지 마세요", prompt)

    def test_review_prompt_allows_supplied_editorial_insights(self):
        prompt = review_prompt(sample_spec(), "야경을 감상하기 좋습니다.")

        self.assertIn("verified=false", prompt)
        self.assertIn("제공된 사실 목록에 있다면 허용", prompt)

    def test_deterministic_validation_rejects_changed_opening_and_number(self):
        errors = deterministic_errors(
            sample_spec(),
            "다른 첫 문장입니다. 이 정문은 오래전에 완공되었습니다." + " 안내입니다." * 12,
            ["gate:year"],
        )
        self.assertTrue(any("opening line" in error for error in errors))
        self.assertTrue(any("2019" in error for error in errors))

    def test_deterministic_validation_rejects_financial_details(self):
        script = (
            "이곳은 정문입니다. 이 정문은 2019년에 완공되었어요. "
            "총사업비는 53억 원이에요. 정문의 야경도 함께 바라보실까요? "
            "천천히 둘러본 뒤 다음 장소로 이동해 봐요."
        )

        errors = deterministic_errors(sample_spec(), script, ["gate:year"])

        self.assertTrue(any("financial detail" in error for error in errors))

    def test_generation_requires_deterministic_and_semantic_approval(self):
        script = (
            "이곳은 정문입니다. 이 정문은 2019년에 완공되었습니다. "
            "캠퍼스로 들어오는 사람들을 맞이하는 장소이며 주변을 천천히 둘러보면서 "
            "정문의 형태와 공간이 주는 분위기를 함께 살펴보시기 바랍니다. "
            "이제 정문을 지나 다음 캠퍼스 공간으로 이동해 보겠습니다."
        )
        llm = FakeLlm([
            {"script": script, "usedFactIds": ["gate:year"]},
            {
                "approved": True,
                "coveredRequiredFactIds": ["gate:year"],
                "unsupportedClaims": [],
                "tourLike": True,
                "engagementPresent": True,
                "financialDetailPresent": False,
            },
        ])

        generated, used = generate_and_validate(sample_spec(), llm)

        self.assertEqual(generated, script)
        self.assertEqual(used, ["gate:year"])


if __name__ == "__main__":
    unittest.main()
