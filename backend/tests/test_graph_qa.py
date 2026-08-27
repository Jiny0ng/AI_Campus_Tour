import unittest

from services.graph_qa import (
    _json_object,
    QUERY_TEMPLATES,
    parse_proximity_question,
    validate_read_only_cypher,
)


class JsonObjectTests(unittest.TestCase):
    def test_extracts_json_object_from_model_response(self):
        self.assertEqual(
            _json_object('```json\n{"intent":"facts","keyword":"도서관"}\n```'),
            {"intent": "facts", "keyword": "도서관"},
        )

    def test_invalid_json_returns_empty_object(self):
        self.assertEqual(_json_object("not json"), {})


class GraphQaTemplateTests(unittest.TestCase):
    def test_all_server_owned_queries_pass_read_only_validation(self):
        for intent, query in QUERY_TEMPLATES.items():
            with self.subTest(intent=intent):
                self.assertEqual(validate_read_only_cypher(query), query.strip())

    def test_facility_query_covers_all_imported_ownership_shapes(self):
        query = QUERY_TEMPLATES["facility"]
        self.assertIn("LOCATED_IN", query)
        self.assertIn("HAS_STORE", query)
        self.assertIn("HAS_FLOOR", query)
        self.assertIn("HAS_FACILITY|HAS_ROOM", query)

    def test_fact_query_does_not_exact_match_abstract_llm_keyword(self):
        query = QUERY_TEMPLATES["facts"]
        self.assertNotIn("fact.content CONTAINS $keyword", query)
        self.assertNotIn("fact.category CONTAINS $keyword", query)

    def test_nearby_prefers_near_and_can_fall_back_to_semi_near(self):
        query = QUERY_TEMPLATES["nearby"]
        self.assertIn("NEAR|SEMI_NEAR", query)
        self.assertIn("proximity.proximityTier = 'NEAR' THEN 0 ELSE 1", query)

    def test_nearby_uses_named_origin_and_searches_facilities_inside_nearby_buildings(self):
        query = QUERY_TEMPLATES["nearby"]
        self.assertIn("origin.name CONTAINS $entity_name", query)
        self.assertIn("LOCATED_IN", query)
        self.assertIn("HAS_STORE", query)
        self.assertIn("HAS_FLOOR", query)
        self.assertIn("HAS_FACILITY|HAS_ROOM", query)

    def test_parses_named_korean_proximity_question(self):
        self.assertEqual(
            ("중앙도서관", "카페"),
            parse_proximity_question("중앙도서관 근처 카페 알려줘"),
        )

    def test_parses_current_location_proximity_question(self):
        self.assertEqual(("", "편의점"), parse_proximity_question("주변 편의점 알려주세요"))


if __name__ == "__main__":
    unittest.main()
