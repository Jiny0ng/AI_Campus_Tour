import unittest

from scripts.validate_audio_manifest import (
    LOCALE_CODES,
    REQUIRED_SYSTEM_ASSETS,
    SUPPORTED_LANGUAGES,
    is_legacy_manifest_asset,
    is_review_sample,
    required_asset_errors,
)


class ValidateAudioManifestTests(unittest.TestCase):
    def test_review_samples_are_not_production_assets(self):
        self.assertTrue(is_review_sample("sample-ending:tour_01_new_gate:ko"))
        self.assertTrue(is_review_sample("sample-story:docent_leopard_statue:ko"))
        self.assertFalse(is_review_sample("en-route-docent:tour_01_new_gate:ko"))
        self.assertFalse(is_review_sample("arrival-docent:tour_01_new_gate:ko"))

    def test_mp3_manifest_entries_are_legacy(self):
        self.assertTrue(is_legacy_manifest_asset({"objectName": "assets/old.mp3"}))
        self.assertFalse(is_legacy_manifest_asset({"objectName": "assets/current.wav"}))

    def test_every_supported_language_has_a_required_system_asset(self):
        self.assertEqual(
            REQUIRED_SYSTEM_ASSETS,
            {
                f"system:first-stop-microphone-tip:{language}"
                for language in SUPPORTED_LANGUAGES
            },
        )
        self.assertEqual(set(LOCALE_CODES), set(SUPPORTED_LANGUAGES))

    def test_missing_language_and_system_assets_are_rejected(self):
        script = {
            "status": "active",
            "arrivalEnabled": False,
            "contentVersion": "version-1",
            "translations": {language: {} for language in SUPPORTED_LANGUAGES},
        }
        assets = {
            "en-route-docent:tour_01_new_gate:ko": {
                "contentVersion": "version-1",
                "language": "ko",
                "locale": "ko-KR",
            },
        }

        errors = required_asset_errors(assets, {"tour_01_new_gate": script})

        self.assertIn(
            "en-route-docent:tour_01_new_gate:en:missing-for-active-script",
            errors,
        )
        self.assertIn(
            "system:first-stop-microphone-tip:ko:missing-required-system-asset",
            errors,
        )

    def test_complete_multilingual_assets_are_accepted(self):
        script = {
            "status": "active",
            "arrivalEnabled": True,
            "contentVersion": "version-1",
            "translations": {language: {} for language in SUPPORTED_LANGUAGES},
        }
        assets = {
            asset_id: {
                "contentVersion": "v1",
                "language": asset_id.rsplit(":", 1)[-1],
                "locale": LOCALE_CODES[asset_id.rsplit(":", 1)[-1]],
            }
            for asset_id in REQUIRED_SYSTEM_ASSETS
        }
        for language in SUPPORTED_LANGUAGES:
            for style in ("en-route-docent", "arrival-docent"):
                assets[f"{style}:tour_01_new_gate:{language}"] = {
                    "contentVersion": "version-1",
                    "language": language,
                    "locale": LOCALE_CODES[language],
                }

        self.assertEqual(required_asset_errors(assets, {"tour_01_new_gate": script}), [])


if __name__ == "__main__":
    unittest.main()
