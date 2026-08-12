from datetime import date, datetime
from typing import Optional
from pydantic import field_serializer
from app.schemas.common import CamelModel, serialize_datetime_iso_utc


class WorkshopPlanningCreate(CamelModel):
    vehicleId: int
    planDate: date
    appointmentId: Optional[int] = None


class WorkshopPlanningResponse(CamelModel):
    id: int
    vehicleId: int
    planDate: date
    appointmentId: Optional[int] = None
    appointmentStartTime: Optional[datetime] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: Optional[str] = None
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None

    @field_serializer("appointmentStartTime")
    def _serialize_appt_start(self, dt: Optional[datetime]) -> Optional[str]:
        if dt is None:
            return None
        return serialize_datetime_iso_utc(dt)
