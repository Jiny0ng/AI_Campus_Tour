import unittest

from near_relations import build_near_relations


class NearRelationsTest(unittest.TestCase):
    def test_uses_walking_network_and_sixty_second_limit(self):
        graph = {
            (127.0, 35.0): {(127.0005, 35.0): 50.0},
            (127.0005, 35.0): {(127.0, 35.0): 50.0, (127.001, 35.0): 50.0},
            (127.001, 35.0): {(127.0005, 35.0): 50.0},
        }
        candidates = [
            {"id": "a", "entity_type": "building", "latitude": 35.0, "longitude": 127.0},
            {"id": "b", "entity_type": "building", "latitude": 35.0, "longitude": 127.0005},
            {"id": "c", "entity_type": "building", "latitude": 35.0, "longitude": 127.001},
        ]

        relations = build_near_relations(candidates, graph, [])

        self.assertEqual([("a", "b"), ("b", "c")], [
            (row["from_id"], row["to_id"]) for row in relations
        ])
        self.assertTrue(all(row["method"] == "walking_network" for row in relations))
        self.assertTrue(all(row["walking_seconds"] <= 60 for row in relations))

    def test_manual_include_and_exclude_override_generated_relations(self):
        graph = {(127.0, 35.0): {}}
        candidates = [
            {"id": "a", "entity_type": "building", "latitude": 35.0, "longitude": 127.0},
            {"id": "b", "entity_type": "building", "latitude": 35.0, "longitude": 127.0001},
            {"id": "c", "entity_type": "building", "latitude": 35.01, "longitude": 127.01},
        ]
        overrides = [
            {"from_id": "a", "to_id": "b", "action": "exclude"},
            {
                "from_id": "a", "to_id": "c", "action": "include",
                "walking_seconds": "45", "distance_m": "55", "verified": "true",
                "note": "현장 확인",
            },
        ]

        relations = build_near_relations(candidates, graph, overrides)

        self.assertEqual(1, len(relations))
        self.assertEqual(("a", "c"), (relations[0]["from_id"], relations[0]["to_id"]))
        self.assertEqual("manual", relations[0]["method"])
        self.assertTrue(relations[0]["verified"])


if __name__ == "__main__":
    unittest.main()
