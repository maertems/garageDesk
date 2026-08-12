"""Pydantic schemas for companySettings (Lot B)."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from app.schemas.common import CamelModel


class CompanySettingsUpdate(CamelModel):
    name: Optional[str] = None
    shareCapital: Optional[Decimal] = None
    siren: Optional[str] = None
    siretHeadquarters: Optional[str] = None
    rcsCity: Optional[str] = None
    vatIntracom: Optional[str] = None
    nafCode: Optional[str] = None
    addressLine1: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    countryCode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    mediatorName: Optional[str] = None
    mediatorUrl: Optional[str] = None
    mediatorAddress: Optional[str] = None
    vatExemption: Optional[bool] = None


class CompanySettingsResponse(CamelModel):
    id: int
    name: str
    shareCapital: Optional[Decimal] = None
    siren: Optional[str] = None
    siretHeadquarters: Optional[str] = None
    rcsCity: Optional[str] = None
    vatIntracom: Optional[str] = None
    nafCode: Optional[str] = None
    addressLine1: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    countryCode: str
    phone: Optional[str] = None
    email: Optional[str] = None
    iban: Optional[str] = None
    bic: Optional[str] = None
    mediatorName: Optional[str] = None
    mediatorUrl: Optional[str] = None
    mediatorAddress: Optional[str] = None
    vatExemption: bool
    createdAt: datetime
    updatedAt: datetime
    # Computed: mandatory fields missing for invoice issuance (not stored in DB)
    missingMandatoryFields: list[str] = []
