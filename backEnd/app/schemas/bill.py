from app.schemas.common import CamelModel
from typing import Optional
from datetime import date


class BillBase(CamelModel):
    billId: int
    docId: Optional[int] = None
    docNum: Optional[int] = None
    vmodId: Optional[str] = None
    vehicleId: Optional[int] = None
    clientId: int
    account: Optional[str] = None
    dateDoc: Optional[date] = None
    dateBill: Optional[date] = None
    type: Optional[str] = None
    status: str
    notBilled: Optional[int] = None


class BillCreate(BillBase):
    pass


class BillUpdate(CamelModel):
    billId: Optional[int] = None
    docId: Optional[int] = None
    docNum: Optional[int] = None
    vmodId: Optional[str] = None
    vehicleId: Optional[int] = None
    clientId: Optional[int] = None
    account: Optional[str] = None
    dateDoc: Optional[date] = None
    dateBill: Optional[date] = None
    type: Optional[str] = None
    status: Optional[str] = None
    notBilled: Optional[int] = None


class BillResponse(BillBase):
    id: int


class BillListItemResponse(CamelModel):
    id: int
    billId: int
    docNum: Optional[int] = None
    dateDoc: Optional[date] = None
    type: Optional[str] = None
    status: str
    vehicleId: Optional[int] = None
    vehicleBrand: Optional[str] = None
    vehicleModel: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    clientId: int
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
