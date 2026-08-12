from app.schemas.common import CamelModel, serialize_datetime_iso_utc
from typing import Optional
from datetime import datetime, date
from pydantic import field_serializer


class AppointmentBase(CamelModel):
    clientId: Optional[int] = None
    vehicleId: Optional[int] = None
    categoryId: Optional[int] = None
    statusId: Optional[int] = None
    loanVehicleId: Optional[int] = None
    loanStartDate: Optional[date] = None
    loanEndDate: Optional[date] = None
    prestation: Optional[str] = None
    appointmentType: str = "client"  # client | note
    appointmentSubType: Optional[str] = None  # reception | devis | restitution (only for client)
    comment: Optional[str] = None
    smsReminder: bool = False
    startTime: datetime
    endTime: datetime

    @field_serializer("startTime", "endTime")
    def _serialize_datetime(self, dt: datetime) -> str:
        return serialize_datetime_iso_utc(dt)


class AppointmentCreate(AppointmentBase):
    pass


class AppointmentUpdate(CamelModel):
    clientId: Optional[int] = None
    vehicleId: Optional[int] = None
    categoryId: Optional[int] = None
    statusId: Optional[int] = None
    loanVehicleId: Optional[int] = None
    loanStartDate: Optional[date] = None
    loanEndDate: Optional[date] = None
    prestation: Optional[str] = None
    appointmentType: Optional[str] = None
    appointmentSubType: Optional[str] = None
    comment: Optional[str] = None
    smsReminder: Optional[bool] = None
    startTime: Optional[datetime] = None
    endTime: Optional[datetime] = None


class AppointmentResponse(AppointmentBase):
    id: int


class AppointmentWithJoinsResponse(CamelModel):
    id: int
    clientId: Optional[int] = None
    vehicleId: Optional[int] = None
    categoryId: Optional[int] = None
    statusId: Optional[int] = None
    loanVehicleId: Optional[int] = None
    loanStartDate: Optional[date] = None
    loanEndDate: Optional[date] = None
    prestation: Optional[str] = None
    appointmentType: str = "client"
    appointmentSubType: Optional[str] = None
    comment: Optional[str] = None
    smsReminder: bool = False
    startTime: datetime
    endTime: datetime
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    vehicleBrand: Optional[str] = None
    vehicleModel: Optional[str] = None
    categoryCode: Optional[str] = None
    statusCode: Optional[str] = None
    categoryColor: Optional[str] = None
    statusColor: Optional[str] = None
    loanVehicleUniqueNumber: Optional[str] = None
    loanVehicleBrand: Optional[str] = None
    loanVehicleModel: Optional[str] = None

    @field_serializer("startTime", "endTime")
    def _serialize_datetime(self, dt: datetime) -> str:
        return serialize_datetime_iso_utc(dt)
