from services.docent_content import assemble_docent_context, build_stop_presentation


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


def test_stop_presentation_uses_pre_generated_overview_and_useful_tips():
    context = {
        "description": "긴 장소 설명",
        "requiredFacts": [
            {
                "factId": "place:identity",
                "category": "identity",
                "content": "대표적인 캠퍼스 학습 공간이다.",
                "verified": True,
            },
            {
                "factId": "place:tip",
                "category": "recommendation",
                "content": "2층 열람실도 이용해 볼 만하다.",
                "verified": True,
            },
            {
                "factId": "place:extra",
                "category": "experience",
                "content": "날씨가 좋으면 테라스를 이용할 수 있다.",
                "verified": False,
            },
        ],
        "optionalFacts": [],
    }

    overview, insights = build_stop_presentation(
        context,
        "기본 설명",
        "이곳은 대표 학습 공간입니다. 열람과 휴식을 함께 할 수 있습니다. 이용 전에 좌석을 확인해보세요. 네 번째 문장은 제외됩니다.",
    )

    assert overview == "이곳은 대표 학습 공간입니다. 열람과 휴식을 함께 할 수 있습니다. 이용 전에 좌석을 확인해보세요."
    assert [fact["factId"] for fact in insights] == ["place:tip", "place:extra"]


def test_stop_presentation_has_safe_fallback():
    assert build_stop_presentation(None, "기본 설명") == ("기본 설명", [])
