"""Pydantic schemas for payments (Lot H)."""

from datetime import date, datetime
from typing import Optional

from app.schemas.common import CamelModel


class PaymentCreate(CamelModel):
    invoiceId: int
    amount: float
    paymentMethod: str  # ENUM: cash|card|wireTransfer|check|sepaDebit|other
    paidAt: Optional[date] = None
    reference: Optional[str] = None


class PaymentCancelRequest(CamelModel):
    cancellationReason: Optional[str] = None


class PaymentResponse(CamelModel):
    id: int
    invoiceId: int
    paidAt: Optional[date] = None
    amount: float
    paymentMethod: str
    isoPaymentMethodCode: Optional[str] = None
    reference: Optional[str] = None
    isCancelled: bool
    cancellationReason: Optional[str] = None
    createdAt: datetime
    createdByUserId: Optional[int] = None
