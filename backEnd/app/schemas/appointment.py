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
    # Avertissement à afficher quand la notification de création n'est pas partie.
    # Absent le reste du temps. Le rendez-vous est créé dans tous les cas : un RDV
    # perdu parce qu'un SMS n'est pas parti serait un remède pire que le mal.
    notificationWarning: Optional[str] = None


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
    # Finition du véhicule du client, affichée dans l'infobulle du calendrier.
    vehicleType: Optional[str] = None
    loanVehicleUniqueNumber: Optional[str] = None
    loanVehicleBrand: Optional[str] = None
    loanVehicleModel: Optional[str] = None

    @field_serializer("startTime", "endTime")
    def _serialize_datetime(self, dt: datetime) -> str:
        return serialize_datetime_iso_utc(dt)
