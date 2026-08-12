from app.schemas.common import CamelModel
from typing import Optional


class BillDetailBase(CamelModel):
    billId: int
    type: Optional[str] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    time: Optional[float] = None
    timeEquivalentT1: Optional[float] = None
    priceHT: Optional[float] = None
    price: Optional[float] = None
    unitPrice: Optional[str] = None
    taxeType: Optional[str] = None
    taxe: Optional[float] = None
    cashBack: Optional[float] = None


class BillDetailCreate(BillDetailBase):
    pass


class BillDetailUpdate(CamelModel):
    type: Optional[str] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    time: Optional[float] = None
    timeEquivalentT1: Optional[float] = None
    priceHT: Optional[float] = None
    price: Optional[float] = None
    unitPrice: Optional[str] = None
    taxeType: Optional[str] = None
    taxe: Optional[float] = None
    cashBack: Optional[float] = None


class BillDetailResponse(BillDetailBase):
    id: int
