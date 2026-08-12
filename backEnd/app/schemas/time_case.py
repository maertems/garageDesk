from app.schemas.common import CamelModel
from typing import Optional
from datetime import date
from decimal import Decimal


class TimeCaseBase(CamelModel):
    employeeId: int
    billId: Optional[int] = None
    time: Decimal
    type: int  # FK timeCaseCategories.id
    date: date
    comment: Optional[str] = None


class TimeCaseCreate(TimeCaseBase):
    pass


class TimeCaseUpdate(CamelModel):
    employeeId: Optional[int] = None
    billId: Optional[int] = None
    time: Optional[Decimal] = None
    type: Optional[int] = None
    date: Optional[date] = None
    comment: Optional[str] = None


class TimeCaseResponse(TimeCaseBase):
    id: int
