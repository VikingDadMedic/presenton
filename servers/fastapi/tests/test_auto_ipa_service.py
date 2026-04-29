import pytest

import services.auto_ipa_service as auto_ipa_service


@pytest.mark.anyio
async def test_augment_speaker_note_with_curated_dictionary():
    text = "At dawn, Cinque Terre glows over the harbor."
    result = await auto_ipa_service.augment_speaker_note_with_ipa(text)

    assert '<phoneme alphabet="ipa" ph="ˈtʃiŋkwe ˈtɛrre">Cinque Terre</phoneme>' in result


@pytest.mark.anyio
async def test_augment_speaker_note_keeps_existing_phoneme_tag_unchanged():
    text = (
        'Walk into <phoneme alphabet="ipa" ph="ˈtʃiŋkwe ˈtɛrre">Cinque Terre</phoneme> '
        "before the crowds arrive."
    )
    result = await auto_ipa_service.augment_speaker_note_with_ipa(text)

    assert result.count("<phoneme") == 1
    assert result == text


@pytest.mark.anyio
async def test_augment_speaker_note_uses_llm_fallback(monkeypatch):
    async def _fake_llm_fallback(_terms):
        return {"Valparaiso": "bɑːl.pɑː.rəˈiː.soʊ"}

    monkeypatch.setattr(auto_ipa_service, "_llm_ipa_fallback", _fake_llm_fallback)

    text = "Valparaiso opens up in layers of painted hills."
    result = await auto_ipa_service.augment_speaker_note_with_ipa(
        text,
        destination={"destination_name": "Valparaiso"},
    )

    assert '<phoneme alphabet="ipa" ph="bɑːl.pɑː.rəˈiː.soʊ">Valparaiso</phoneme>' in result
