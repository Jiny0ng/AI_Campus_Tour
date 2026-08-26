from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.tts_prompt_catalog import (  # noqa: E402
    COMMON_DOCENT_DIRECTION,
    DOCENT_PROMPT_PROFILES,
    VOICE_CANDIDATES,
    build_docent_prompt,
)


class TtsPromptCatalogTests(unittest.TestCase):
    def test_matrix_has_both_genders_and_three_distinct_profiles(self):
        self.assertEqual(set(DOCENT_PROMPT_PROFILES), {
            "friendly_senior",
            "calm_senior",
            "lively_senior",
            "proud_lively_senior",
            "bubbly_proud_senior",
        })
        self.assertEqual({voice.gender for voice in VOICE_CANDIDATES.values()}, {"female", "male"})

    def test_every_profile_keeps_the_common_persona_and_exact_text_rule(self):
        for profile_name in DOCENT_PROMPT_PROFILES:
            with self.subTest(profile=profile_name):
                prompt = build_docent_prompt(profile_name)
                self.assertIn(COMMON_DOCENT_DIRECTION, prompt)
                self.assertIn("20대 한국인 대학생", prompt)
                self.assertIn("그대로 읽는다", prompt)

    def test_unknown_profile_is_rejected(self):
        with self.assertRaises(ValueError):
            build_docent_prompt("unknown")

    def test_proud_lively_profile_contains_affection_without_advertising(self):
        prompt = build_docent_prompt("proud_lively_senior")
        self.assertIn("자랑스럽게", prompt)
        self.assertIn("설렘과 애정", prompt)
        self.assertIn("홍보대사나 광고 모델처럼 과장", prompt)

    def test_bubbly_profile_is_bright_but_not_childish_or_shouting(self):
        prompt = build_docent_prompt("bubbly_proud_senior")
        self.assertIn("경쾌하고 통통 튀되", prompt)
        self.assertIn("약간 높은 음역", prompt)
        self.assertIn("소리 지르거나 어린아이처럼", prompt)


if __name__ == "__main__":
    unittest.main()
