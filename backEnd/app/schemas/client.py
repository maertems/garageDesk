from app.schemas.common import CamelModel
from app.schemas.vehicle import VehicleResponse
from typing import Optional


class ClientBase(CamelModel):
    gender: Optional[str] = None
    firstName: Optional[str] = None
    lastName: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    clientType: str = "individual"
    vatNumber: Optional[str] = None
    siren: Optional[str] = None
    # Numéro de compte comptable, saisi à la main et recopié sur les factures
    # (migration 028).
    accountNumber: Optional[str] = None
    vmId: Optional[int] = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(CamelModel):
    gender: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    clientType: Optional[str] = None
    vatNumber: Optional[str] = None
    siren: Optional[str] = None
    # Numéro de compte comptable, saisi à la main et recopié sur les factures
    # (migration 028).
    accountNumber: Optional[str] = None
    vmId: Optional[int] = None


class ClientResponse(ClientBase):
    id: int

    model_config = {"from_attributes": True}


class ClientWithVehiclesResponse(ClientResponse):
    vehicles: list[VehicleResponse] = []
