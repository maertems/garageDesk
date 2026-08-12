from app.schemas.common import CamelModel
from typing import Optional


class AppointmentCategoryBase(CamelModel):
    code: str
    color: Optional[str] = None


class AppointmentCategoryCreate(AppointmentCategoryBase):
    pass


class AppointmentCategoryUpdate(CamelModel):
    code: Optional[str] = None
    color: Optional[str] = None


class AppointmentCategoryResponse(AppointmentCategoryBase):
    id: int
