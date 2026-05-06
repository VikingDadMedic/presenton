from typing import List, Optional

from fastapi import HTTPException
from pydantic import BaseModel, Field

from models.presentation_structure_model import PresentationStructureModel


class SlideLayoutModel(BaseModel):
    id: str
    name: Optional[str] = None
    description: Optional[str] = None
    json_schema: dict


def _summarize_schema_fields(json_schema: dict, *, max_fields: int = 12) -> str:
    """Render a compact one-line-per-field summary of a layout's JSON schema.

    Used by Call 2 (`generate_presentation_structure`) so the LLM can match
    outline shapes to layouts that actually have the right field shape (e.g.
    don't pick a 4-image grid layout when the outline only carries 1 image).
    Full schema rendering is too verbose for prompt budgets — this summary
    keeps to ~1-3 chars per field on average, capped at `max_fields` so
    pathological large schemas don't blow up the prompt.
    """
    if not isinstance(json_schema, dict):
        return ""
    properties = json_schema.get("properties")
    if not isinstance(properties, dict):
        return ""
    required_set = set(json_schema.get("required") or [])
    rendered: List[str] = []
    truncated = False
    for idx, (field_name, schema) in enumerate(properties.items()):
        if idx >= max_fields:
            truncated = True
            break
        if not isinstance(schema, dict):
            continue
        # `type` may be missing for $ref or anyOf entries — skip those
        # silently rather than emit confusing placeholders.
        field_type = schema.get("type")
        if isinstance(field_type, list):
            field_type = "/".join(str(t) for t in field_type)
        if not field_type:
            # Walk anyOf entries to find a primitive type.
            for variant in schema.get("anyOf", []):
                if isinstance(variant, dict) and variant.get("type"):
                    field_type = str(variant["type"])
                    break
        if not field_type:
            field_type = "object"
        suffix_parts: List[str] = []
        if schema.get("type") == "array":
            items = schema.get("items")
            if isinstance(items, dict) and items.get("type"):
                suffix_parts.append(f"of {items['type']}")
            min_items = schema.get("minItems")
            max_items = schema.get("maxItems")
            if min_items is not None or max_items is not None:
                suffix_parts.append(
                    f"len {min_items or 0}-{max_items if max_items is not None else '*'}"
                )
        marker = "*" if field_name in required_set else ""
        suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
        rendered.append(f"{field_name}{marker}: {field_type}{suffix}")
    if truncated:
        rendered.append(f"... +{len(properties) - max_fields} more fields")
    return ", ".join(rendered)


class PresentationLayoutModel(BaseModel):
    name: str
    ordered: bool = Field(default=False)
    slides: List[SlideLayoutModel]

    def get_slide_layout_index(self, slide_layout_id: str) -> int:
        for index, slide in enumerate(self.slides):
            if slide.id == slide_layout_id:
                return index
        raise HTTPException(
            status_code=404, detail=f"Slide layout {slide_layout_id} not found"
        )

    def to_presentation_structure(self) -> PresentationStructureModel:
        return PresentationStructureModel(
            slides=[index for index in range(len(self.slides))]
        )

    def to_string(self, *, include_schemas: bool = False) -> str:
        """Render the layout catalog for the Call 2 prompt.

        When `include_schemas=True`, each layout entry gets a compact
        "Fields" line summarizing its JSON schema (field name, type, array
        length hints, required marker `*`). This unblocks shape-aware
        layout assignment — the LLM can prefer layouts whose required
        fields actually match the outline's available content (e.g. don't
        assign a 4-image-grid layout when the outline has only 1 image
        prompt). Default `False` preserves the legacy name+description-only
        rendering for non-schema-aware paths.
        """
        message = "## Presentation Layout\n\n"
        for index, slide in enumerate(self.slides):
            message += f"### Slide Layout: {index}\n"
            message += f"- Name: {slide.name or slide.json_schema.get('title')}\n"
            message += f"- Description: {slide.description}\n"
            if include_schemas:
                summary = _summarize_schema_fields(slide.json_schema)
                if summary:
                    message += f"- Fields: {summary}\n"
            message += "\n"
        return message
