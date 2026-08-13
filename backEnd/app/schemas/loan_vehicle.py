from app.schemas.common import CamelModel
from typing import Optional


class LoanVehicleBase(CamelModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: str
    mileage: Optional[int] = None
    uniqueNumber: str
    # Un véhicule inactif reste en flotte mais n'est plus proposé aux clients.
    active: bool = True


class LoanVehicleCreate(LoanVehicleBase):
    pass


class LoanVehicleUpdate(CamelModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    licensePlate: Optional[str] = None
    mileage: Optional[int] = None
    uniqueNumber: Optional[str] = None
    active: Optional[bool] = None


class LoanVehicleResponse(LoanVehicleBase):
    id: int
