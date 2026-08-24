from services.docent_content import assemble_docent_context


def test_explicit_docent_config_selects_linked_facts():
    facts = [
        {"factId": "identity", "importance": 100, "selection": "required"},
        {"factId": "year", "importance": 70, "selection": "optional"},
        {"factId": "unused", "importance": 95, "selection": None},
    ]
    context = assemble_docent_context(
        "gate",
        "신정문",
        "정문",
        {"enabled": True, "openingLine": "안내", "targetDurationSeconds": 60},
        facts,
    )

    assert [fact["factId"] for fact in context["requiredFacts"]] == ["identity"]
    assert [fact["factId"] for fact in context["optionalFacts"]] == ["year"]
    assert context["usesDefaultRule"] is False
    assert context["targetDurationSeconds"] == 60


def test_missing_config_uses_importance_fallback():
    facts = [
        {"factId": "a", "importance": 100},
        {"factId": "b", "importance": 90},
        {"factId": "c", "importance": 80},
        {"factId": "d", "importance": 70},
        {"factId": "e", "importance": 60},
        {"factId": "f", "importance": 50},
    ]
    context = assemble_docent_context("building", "건물", "", None, facts)

    assert [fact["factId"] for fact in context["requiredFacts"]] == ["a", "b", "c"]
    assert [fact["factId"] for fact in context["optionalFacts"]] == ["d", "e"]
    assert context["usesDefaultRule"] is True
    assert context["targetDurationSeconds"] == 45
