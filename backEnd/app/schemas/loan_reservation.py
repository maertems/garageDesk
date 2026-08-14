from app.schemas.common import CamelModel, serialize_datetime_iso_utc
from typing import Optional
from datetime import datetime
from pydantic import field_serializer


class LoanReservationBase(CamelModel):
    loanVehicleId: int
    clientId: int
    appointmentId: Optional[int] = None
    startDate: datetime
    endDate: Optional[datetime] = None

    @field_serializer("startDate")
    def _serialize_start(self, dt: datetime) -> str:
        return serialize_datetime_iso_utc(dt)

    @field_serializer("endDate")
    def _serialize_end(self, dt: Optional[datetime]) -> Optional[str]:
        return serialize_datetime_iso_utc(dt) if dt is not None else None

    startMileage: Optional[int] = None
    fuelLevelEighths: Optional[int] = None
    endMileage: Optional[int] = None
    endFuelLevelEighths: Optional[int] = None


class LoanReservationCreate(CamelModel):
    loanVehicleId: int
    clientId: int
    appointmentId: Optional[int] = None
    startDate: datetime
    endDate: Optional[datetime] = None
    startMileage: Optional[int] = None
    fuelLevelEighths: Optional[int] = None


class LoanReservationUpdate(CamelModel):
    loanVehicleId: Optional[int] = None
    appointmentId: Optional[int] = None
    startDate: Optional[datetime] = None
    endDate: Optional[datetime] = None
    startMileage: Optional[int] = None
    fuelLevelEighths: Optional[int] = None
    endMileage: Optional[int] = None
    endFuelLevelEighths: Optional[int] = None


class LoanReservationResponse(LoanReservationBase):
    id: int


class LoanReservationWithJoinsResponse(LoanReservationResponse):
    loanVehicleUniqueNumber: Optional[str] = None
    loanVehicleLicensePlate: Optional[str] = None
    loanVehicleBrand: Optional[str] = None
    loanVehicleModel: Optional[str] = None
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
    appointmentId: Optional[int] = None
    interventionVehicleBrand: Optional[str] = None
    interventionVehicleModel: Optional[str] = None
    # Finition du véhicule du client, affichée dans l'infobulle du calendrier.
    interventionVehicleType: Optional[str] = None
