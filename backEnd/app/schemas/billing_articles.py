"""Pydantic schemas for vatRates and articles (Lot A)."""

from datetime import date, datetime
from typing import Optional

from app.schemas.common import CamelModel
from app.schemas.billing_common import UnitCode


class VatRateBase(CamelModel):
    code: str
    rate: float
    label: str
    facturXCategory: str = "S"
    validFrom: Optional[date] = None
    validUntil: Optional[date] = None


class VatRateCreate(VatRateBase):
    pass


class VatRateUpdate(CamelModel):
    code: Optional[str] = None
    rate: Optional[float] = None
    label: Optional[str] = None
    facturXCategory: Optional[str] = None
    validFrom: Optional[date] = None
    validUntil: Optional[date] = None


class VatRateResponse(VatRateBase):
    id: int
    createdAt: datetime
    updatedAt: datetime


class ArticleBase(CamelModel):
    reference: Optional[str] = None
    type: Optional[str] = None
    label: str
    unitCode: UnitCode = "unit"
    vatRateId: Optional[int] = None
    price: float = 0.0
    isActive: bool = True


class ArticleCreate(ArticleBase):
    pass


class ArticleUpdate(CamelModel):
    reference: Optional[str] = None
    type: Optional[str] = None
    label: Optional[str] = None
    unitCode: Optional[UnitCode] = None
    vatRateId: Optional[int] = None
    price: Optional[float] = None
    isActive: Optional[bool] = None


class ArticleResponse(ArticleBase):
    id: int
    createdAt: datetime
    updatedAt: datetime
