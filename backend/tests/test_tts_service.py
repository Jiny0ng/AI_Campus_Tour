from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.audio_storage import StoredAudio
from services.tts_service import audio_id_for, normalize_text, object_name_for, synthesize


class TtsServiceTests(unittest.TestCase):
    def test_normalize_text_removes_markup_controls_and_extra_space(self):
        self.assertEqual(
            normalize_text(" <b>안녕</b>\x00   캠퍼스\n투어 "),
            "안녕 캠퍼스 투어",
        )

    def test_hash_is_stable_for_equivalent_whitespace(self):
        first = audio_id_for("안녕   캠퍼스", "ko-KR", "navigation", "v1")
        second = audio_id_for("안녕 캠퍼스", "ko-KR", "navigation", "v1")
        self.assertEqual(first, second)

    def test_user_answer_and_location_cache_scopes_are_separate(self):
        audio_id = "a" * 64
        location = object_name_for(audio_id, "ko-KR", "location-docent")
        navigation = object_name_for(audio_id, "ko-KR", "navigation")
        self.assertTrue(location.startswith("cache/location-docent/"))
        self.assertTrue(location.endswith(".wav"))
        self.assertTrue(navigation.startswith("assets/navigation/"))
        self.assertTrue(navigation.endswith(".wav"))

    def test_content_version_changes_hash(self):
        first = audio_id_for("테스트", "ko-KR", "system", "v1")
        second = audio_id_for("테스트", "ko-KR", "system", "v2")
        self.assertNotEqual(first, second)

    def test_selected_prompt_and_parameters_change_the_cache_identity(self):
        navigation = audio_id_for("100미터 앞에서 왼쪽으로 이동하세요.", "ko-KR", "navigation", "v1")
        docent = audio_id_for("100미터 앞에서 왼쪽으로 이동하세요.", "ko-KR", "core-docent", "v1")
        self.assertNotEqual(navigation, docent)

    @patch("services.tts_service._synthesize_with_google")
    @patch("services.tts_service.read_object")
    def test_storage_hit_does_not_call_tts(self, read_object, synthesize_google):
        read_object.return_value = StoredAudio(b"cached")
        result = synthesize("안내", "ko-KR", "navigation", "v1")
        self.assertEqual(result.content, b"cached")
        self.assertEqual(result.cache_status, "HIT")
        synthesize_google.assert_not_called()

    @patch("services.tts_service.write_object")
    @patch("services.tts_service._synthesize_with_google", return_value=b"answer")
    def test_user_answer_bypasses_storage(self, _synthesize_google, write_object):
        result = synthesize("답변", "ko-KR", "user-answer", "v1")
        self.assertEqual(result.cache_status, "BYPASS")
        write_object.assert_not_called()


if __name__ == "__main__":
    unittest.main()
