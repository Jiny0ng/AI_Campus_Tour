from typing import Literal

from pydantic import BaseModel, Field, field_validator


TtsLocale = Literal["ko-KR", "en-US", "ja-JP", "cmn-CN"]
TtsStyle = Literal[
    "navigation",
    "arrival",
    "system",
    "filler",
    "core-docent",
    "location-docent",
    "user-answer",
]


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    locale: TtsLocale
    style: TtsStyle
    contentVersion: str = Field(default="v1", min_length=1, max_length=40)

    @field_validator("text")
    @classmethod
    def validate_text_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 4_000:
            raise ValueError("text must be 4,000 UTF-8 bytes or fewer")
        return value

