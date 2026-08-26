from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.tts_presets import BUBBLY_DOCENT, preset_for  # noqa: E402


class TtsPresetTests(unittest.TestCase):
    def test_selected_korean_docent_preset_is_saved_exactly(self):
        preset = preset_for("core-docent", "ko-KR")
        self.assertEqual(preset, BUBBLY_DOCENT)
        self.assertEqual(preset.voice, "Sulafat")
        self.assertEqual(preset.model, "gemini-2.5-pro-tts")
        self.assertEqual(preset.speaking_rate, 1.08)
        self.assertEqual(preset.pitch, 4.0)
        self.assertEqual(preset.encoding, "LINEAR16")
        self.assertEqual(preset.sample_rate_hertz, 24000)
        self.assertIn("경쾌하고 통통 튀되", preset.prompt)
        self.assertIn("마지막 모음을 늘이지 않는다", preset.prompt)

    def test_navigation_uses_the_same_selected_gemini_preset(self):
        self.assertEqual(preset_for("navigation", "ko-KR"), BUBBLY_DOCENT)

    def test_user_answers_use_the_same_selected_gemini_preset(self):
        self.assertEqual(preset_for("user-answer", "ko-KR"), BUBBLY_DOCENT)

    def test_other_locales_do_not_switch_to_a_legacy_provider(self):
        self.assertEqual(preset_for("location-docent", "en-US"), BUBBLY_DOCENT)


if __name__ == "__main__":
    unittest.main()
