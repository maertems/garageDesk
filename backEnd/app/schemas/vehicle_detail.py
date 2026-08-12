from app.schemas.common import CamelModel
from typing import Optional


class VehicleDetailBase(CamelModel):
    vehicleId: int
    detailKey: str
    detailValue: Optional[str] = None


class VehicleDetailCreate(VehicleDetailBase):
    pass


class VehicleDetailUpdate(CamelModel):
    detailKey: Optional[str] = None
    detailValue: Optional[str] = None


class VehicleDetailResponse(VehicleDetailBase):
    id: int
