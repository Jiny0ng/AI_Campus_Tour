import unittest

from scripts.validate_audio_manifest import is_review_sample


class ValidateAudioManifestTests(unittest.TestCase):
    def test_review_samples_are_not_production_assets(self):
        self.assertTrue(is_review_sample("sample-ending:tour_01_new_gate:ko"))
        self.assertTrue(is_review_sample("sample-story:docent_leopard_statue:ko"))
        self.assertFalse(is_review_sample("en-route-docent:tour_01_new_gate:ko"))
        self.assertFalse(is_review_sample("arrival-docent:tour_01_new_gate:ko"))


if __name__ == "__main__":
    unittest.main()
