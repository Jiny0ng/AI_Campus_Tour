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


def test_facility_tips_exclude_nursing_room_and_merge_numbered_reading_rooms():
    context = {
        "description": "도서관",
        "requiredFacts": [],
        "optionalFacts": [],
        "facilities": [
            {"id": "nursing", "name": "모유수유실", "floor": "1층", "features": "모유수유 가능"},
            {"id": "room-1", "name": "제1열람실", "floor": "4층", "features": "독서실형 책상"},
            {"id": "room-2", "name": "제2열람실", "floor": "4층", "features": "열람실형 학습 좌석"},
            {"id": "room-3", "name": "제3열람실", "floor": "4층", "features": "독서실형 책상"},
        ],
    }

    _, insights = build_stop_presentation(context, "기본 설명")

    assert len(insights) == 1
    assert insights[0]["factId"] == "facility:reading-rooms:4층"
    assert "4층" in insights[0]["content"]
    assert "모유수유실" not in insights[0]["content"]
