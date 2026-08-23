import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import tts as tts_router
from services.tts_service import SynthesisResult


class TtsRouterTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(tts_router.router)
        self.client = TestClient(app)
        with tts_router._rate_lock:
            tts_router._rate_buckets.clear()

    @staticmethod
    def payload(**overrides):
        return {
            "text": "안내 문장",
            "locale": "ko-KR",
            "style": "navigation",
            "contentVersion": "v1",
            **overrides,
        }

    @patch("routers.tts.synthesize")
    def test_valid_synthesis_returns_audio(self, synthesize):
        synthesize.return_value = SynthesisResult(b"mp3", "audio-id", "HIT", 0, 3)

        response = self.client.post("/tts/synthesize", json=self.payload())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"mp3")
        self.assertEqual(response.headers["x-audio-cache"], "HIT")

    def test_rejects_original_body_larger_than_8kb(self):
        response = self.client.post(
            "/tts/synthesize",
            content=json.dumps(self.payload(ignored="x" * 8_192)),
            headers={"Content-Type": "application/json"},
        )

        self.assertEqual(response.status_code, 413)

    def test_rejects_unsupported_locale_style_and_long_text(self):
        cases = (
            self.payload(locale="fr-FR"),
            self.payload(style="advertisement"),
            self.payload(text="가" * 501),
        )
        for payload in cases:
            with self.subTest(payload=payload):
                response = self.client.post("/tts/synthesize", json=payload)
                self.assertEqual(response.status_code, 422)

    def test_rejects_unapproved_browser_origin(self):
        response = self.client.post(
            "/tts/synthesize",
            json=self.payload(),
            headers={"Origin": "https://untrusted.example"},
        )

        self.assertEqual(response.status_code, 403)

    @patch("routers.tts.synthesize")
    def test_rate_limit_returns_retry_after(self, synthesize):
        synthesize.return_value = SynthesisResult(b"mp3", "audio-id", "HIT", 0, 0)

        responses = [self.client.post("/tts/synthesize", json=self.payload(text=str(index))) for index in range(6)]

        self.assertTrue(all(response.status_code == 200 for response in responses[:5]))
        self.assertEqual(responses[5].status_code, 429)
        self.assertEqual(responses[5].headers["retry-after"], "60")

    @patch("routers.tts.load_manifest", return_value={"version": 1, "assets": {}})
    def test_unknown_asset_returns_404(self, _load_manifest):
        response = self.client.get("/tts/assets/missing")

        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
