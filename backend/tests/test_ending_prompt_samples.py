import io
import unittest
import wave

from scripts.generate_ending_prompt_samples import (
    append_trailing_silence,
    ending_matches,
    expected_ending,
    tail_wav,
    waveform_confidently_complete,
)


def pcm_wav(samples: list[int], rate: int = 24_000) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        frames = b"".join(int(sample).to_bytes(2, "little", signed=True) for sample in samples)
        wav.writeframes(frames)
    return output.getvalue()


class EndingPromptSampleTests(unittest.TestCase):
    def test_ending_match_ignores_spaces_and_punctuation(self):
        text = "전북대의 기상을 한번 떠올려 보세요."
        self.assertEqual(expected_ending(text), "떠올려보세요")
        self.assertTrue(ending_matches(text, "기상을 떠올려 보세요"))
        self.assertFalse(ending_matches(text, "기상을 떠올려"))

    def test_waveform_fast_pass_requires_natural_quiet_tail(self):
        complete = pcm_wav([2_000] * 2_400 + [0] * 4_800)
        clipped = pcm_wav([2_000] * 7_200)
        self.assertTrue(waveform_confidently_complete(complete)[0])
        self.assertFalse(waveform_confidently_complete(clipped)[0])

    def test_tail_and_padding_preserve_pcm_format(self):
        source = pcm_wav([1_000] * 120_000)
        tail = tail_wav(source, seconds=4)
        padded = append_trailing_silence(tail, milliseconds=700)
        with wave.open(io.BytesIO(padded), "rb") as wav:
            self.assertEqual(wav.getframerate(), 24_000)
            self.assertEqual(wav.getnframes(), 4 * 24_000 + 700 * 24)


if __name__ == "__main__":
    unittest.main()
