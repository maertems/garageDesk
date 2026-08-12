from app.schemas.common import CamelModel
from typing import Optional


class LoanVehicleBase(CamelModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: str
    mileage: Optional[int] = None
    uniqueNumber: str


class LoanVehicleCreate(LoanVehicleBase):
    pass


class LoanVehicleUpdate(CamelModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: Optional[str] = None
    mileage: Optional[int] = None
    uniqueNumber: Optional[str] = None


class LoanVehicleResponse(LoanVehicleBase):
    id: int
