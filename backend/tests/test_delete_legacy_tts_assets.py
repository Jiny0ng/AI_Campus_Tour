from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from delete_legacy_tts_assets import legacy_object  # noqa: E402


class LegacyTtsCleanupTests(unittest.TestCase):
    def test_mp3_is_legacy_even_without_metadata(self):
        self.assertTrue(legacy_object("assets/navigation/old.mp3", {}))

    def test_flash_metadata_is_legacy(self):
        self.assertTrue(legacy_object("cache/audio.wav", {"model": "gemini-2.5-flash-tts"}))

    def test_selected_pro_wav_is_preserved(self):
        self.assertFalse(legacy_object(
            "assets/navigation/new.wav",
            {"model": "gemini-2.5-pro-tts", "preset": "bubbly-proud-senior-v1"},
        ))


if __name__ == "__main__":
    unittest.main()
