import unittest

from near_relations import build_near_relations


class NearRelationsTest(unittest.TestCase):
    def test_classifies_short_and_medium_walking_distances(self):
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

        self.assertEqual([("a", "b", "NEAR"), ("a", "c", "SEMI_NEAR"), ("b", "c", "NEAR")], [
            (row["from_id"], row["to_id"], row["relation_type"]) for row in relations
        ])
        self.assertTrue(all(row["method"] == "walking_network" for row in relations))
        self.assertTrue(all(row["distance_m"] <= 350 for row in relations))

    def test_excludes_distances_beyond_semi_near_limit(self):
        graph = {
            (127.0, 35.0): {(127.004, 35.0): 400.0},
            (127.004, 35.0): {(127.0, 35.0): 400.0},
        }
        candidates = [
            {"id": "a", "entity_type": "building", "latitude": 35.0, "longitude": 127.0},
            {"id": "b", "entity_type": "building", "latitude": 35.0, "longitude": 127.004},
        ]
        self.assertEqual([], build_near_relations(candidates, graph, []))

    def test_preserves_distance_precision_at_semi_near_boundary(self):
        graph = {
            (127.0, 35.0): {(127.001, 35.0): 80.4},
            (127.001, 35.0): {(127.0, 35.0): 80.4},
        }
        candidates = [
            {"id": "a", "entity_type": "building", "latitude": 35.0, "longitude": 127.0},
            {"id": "b", "entity_type": "building", "latitude": 35.0, "longitude": 127.001},
        ]

        relations = build_near_relations(candidates, graph, [])

        self.assertEqual("SEMI_NEAR", relations[0]["relation_type"])
        self.assertEqual(80.4, relations[0]["distance_m"])

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
        self.assertEqual("NEAR", relations[0]["relation_type"])
        self.assertTrue(relations[0]["verified"])


if __name__ == "__main__":
    unittest.main()
