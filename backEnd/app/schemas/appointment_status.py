from app.schemas.common import CamelModel
from typing import Optional


class AppointmentStatusBase(CamelModel):
    code: str
    color: Optional[str] = None


class AppointmentStatusCreate(AppointmentStatusBase):
    pass


class AppointmentStatusUpdate(CamelModel):
    code: Optional[str] = None
    color: Optional[str] = None


class AppointmentStatusResponse(AppointmentStatusBase):
    id: int
