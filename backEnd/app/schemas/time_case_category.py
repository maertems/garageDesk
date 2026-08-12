from app.schemas.common import CamelModel


class TimeCaseCategoryBase(CamelModel):
    name: str


class TimeCaseCategoryCreate(TimeCaseCategoryBase):
    pass


class TimeCaseCategoryUpdate(CamelModel):
    name: str | None = None


class TimeCaseCategoryResponse(TimeCaseCategoryBase):
    id: int
