from datetime import datetime
from pydantic import BaseModel, ConfigDict


def serialize_datetime_iso_utc(dt: datetime) -> str:
    """Sérialise en ISO avec Z. Naive = considéré UTC (stockage), le front convertit en local pour l'affichage."""
    s = dt.isoformat()
    if dt.tzinfo is None:
        return s + "Z"
    return s.replace("+00:00", "Z") if s.endswith("+00:00") else s


class ErrorResponse(BaseModel):
    model_config = ConfigDict(alias_generator=lambda s: s)
    code: str
    message: str


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )
