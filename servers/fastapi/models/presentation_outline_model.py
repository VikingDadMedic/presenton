from typing import List, Optional
from pydantic import BaseModel


class SlideOutlineModel(BaseModel):
    content: str
    title: Optional[str] = None
    synopsis: Optional[str] = None


class PresentationOutlineModel(BaseModel):
    slides: List[SlideOutlineModel]

    def to_string(self):
        message = ""
        for i, slide in enumerate(self.slides):
            message += f"## Slide {i+1}:\n"
            message += f"  - Content: {slide} \n"
        return message
