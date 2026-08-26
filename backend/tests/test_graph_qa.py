import unittest

from services.graph_qa import QUERY_TEMPLATES, validate_read_only_cypher


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


if __name__ == "__main__":
    unittest.main()
