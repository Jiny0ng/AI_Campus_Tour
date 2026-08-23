from __future__ import annotations

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from utils.navigation_guides import local_guides


class LocalGuideTests(unittest.TestCase):
    def test_adds_turn_and_arrival_without_changing_path(self):
        path = [
            {"lat": 35.0, "lng": 127.0},
            {"lat": 35.0003, "lng": 127.0},
            {"lat": 35.0003, "lng": 127.0004},
            {"lat": 35.0003, "lng": 127.0008},
        ]
        guides = local_guides(path)
        self.assertEqual(guides[-1]["type"], 88)
        self.assertEqual(guides[-1]["pointIndex"], len(path) - 1)
        self.assertTrue(any(guide["type"] != 88 for guide in guides))

    def test_straight_path_only_adds_arrival(self):
        path = [
            {"lat": 35.0, "lng": 127.0},
            {"lat": 35.0003, "lng": 127.0},
            {"lat": 35.0006, "lng": 127.0},
        ]
        guides = local_guides(path)
        self.assertEqual([guide["type"] for guide in guides], [88])


if __name__ == "__main__":
    unittest.main()
