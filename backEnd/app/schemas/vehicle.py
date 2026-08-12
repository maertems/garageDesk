from app.schemas.common import CamelModel
from typing import Optional
from datetime import date


class VehicleBase(CamelModel):
    clientId: int
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: str
    vin: Optional[str] = None
    mileage: Optional[int] = None
    vmId: Optional[int] = None
    type: Optional[str] = None  # finition
    registrationDate: Optional[date] = None  # 1ère mise en circulation


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(CamelModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: Optional[str] = None
    vin: Optional[str] = None
    mileage: Optional[int] = None
    vmId: Optional[int] = None
    type: Optional[str] = None
    registrationDate: Optional[date] = None


class VehicleResponse(VehicleBase):
    id: int


class VehicleListResponse(VehicleResponse):
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
