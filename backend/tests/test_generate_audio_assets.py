import tempfile
import unittest
from pathlib import Path

from scripts.generate_audio_assets import read_rows


class GenerateAudioAssetsTests(unittest.TestCase):
    def test_malformed_csv_row_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "messages.csv"
            path.write_text(
                "id,locale,text,enabled,content_version,style\n"
                "system:test:en,en-US,Hello, world,true,v1,system\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "messages.csv:2: malformed CSV row"):
                read_rows(path)

    def test_quoted_comma_is_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "messages.csv"
            path.write_text(
                "id,locale,text,enabled,content_version,style\n"
                'system:test:en,en-US,"Hello, world",true,v1,system\n',
                encoding="utf-8",
            )

            self.assertEqual(read_rows(path)[0]["text"], "Hello, world")


if __name__ == "__main__":
    unittest.main()
