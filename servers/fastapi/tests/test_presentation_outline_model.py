from models.presentation_outline_model import (
    PresentationOutlineModel,
    SlideOutlineModel,
)


def test_to_string_emits_only_content_not_pydantic_repr():
    outline = PresentationOutlineModel(
        slides=[
            SlideOutlineModel(content="First slide body", title="One", synopsis="s1"),
            SlideOutlineModel(content="Second slide body", title="Two", synopsis="s2"),
        ]
    )

    rendered = outline.to_string()

    assert "First slide body" in rendered
    assert "Second slide body" in rendered

    assert "SlideOutlineModel(" not in rendered, (
        "to_string() must format each slide's content directly, not the "
        "Pydantic repr of the SlideOutlineModel (token waste in Call 2 user "
        "prompt). See main-workflow.md issue F."
    )
    assert "title=" not in rendered, (
        "to_string() must not leak the title= kwarg from the Pydantic repr."
    )
    assert "synopsis=" not in rendered, (
        "to_string() must not leak the synopsis= kwarg from the Pydantic repr."
    )


def test_to_string_preserves_slide_indexing():
    outline = PresentationOutlineModel(
        slides=[
            SlideOutlineModel(content="alpha"),
            SlideOutlineModel(content="bravo"),
            SlideOutlineModel(content="charlie"),
        ]
    )

    rendered = outline.to_string()

    assert "## Slide 1:" in rendered
    assert "## Slide 2:" in rendered
    assert "## Slide 3:" in rendered
    assert rendered.index("alpha") < rendered.index("bravo") < rendered.index("charlie")


def test_to_string_handles_empty_outline():
    outline = PresentationOutlineModel(slides=[])
    assert outline.to_string() == ""
