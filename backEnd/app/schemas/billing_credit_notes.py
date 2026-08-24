"""Pydantic schemas for creditNotes and creditNoteLines (Lot I)."""

from datetime import date, datetime
from typing import Optional

from app.schemas.common import CamelModel


class CreditNoteLineCreate(CamelModel):
    sourceDocumentId: Optional[int] = None
    sourceDocumentType: Optional[str] = None
    lineType: Optional[str] = None
    label: str
    longDescription: Optional[str] = None
    quantity: float
    unitCode: Optional[str] = None
    unitPriceHt: float
    discountPercent: float = 0.0
    vatRate: float
    facturXVatCategory: str = "S"


class CreditNoteCreate(CamelModel):
    sourceInvoiceId: int
    reason: str
    refundMethod: str  # commercialCredit | wireTransferRefund | cashRefund | other
    serviceDate: Optional[date] = None
    refundedAt: Optional[date] = None
    # If empty, all invoice lines are copied (full credit note)
    lines: list[CreditNoteLineCreate] = []


class CreditNoteLineResponse(CamelModel):
    id: int
    creditNoteId: int
    lineNumber: int
    sourceDocumentId: Optional[int] = None
    sourceDocumentType: Optional[str] = None
    lineType: Optional[str] = None
    # Référence de l'article, recopiée à l'émission (migration 028). En réponse
    # seulement : le service la reprend de l'article, elle n'est jamais fournie.
    articleReference: Optional[str] = None
    label: str
    longDescription: Optional[str] = None
    quantity: float
    unitCode: Optional[str] = None
    unitPriceHt: float
    discountPercent: float
    discountAmount: float
    vatRate: float
    facturXVatCategory: str
    totalHt: float
    totalVat: float
    totalTtc: float
    createdAt: datetime


class CreditNoteListItem(CamelModel):
    id: int
    uuid: str
    creditNoteNumber: str
    sourceInvoiceId: int
    sourceInvoiceNumber: Optional[str] = None
    issuedAt: datetime
    reason: str
    refundMethod: str
    clientName: Optional[str] = None
    clientFirstName: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    vehicleMake: Optional[str] = None
    vehicleModel: Optional[str] = None
    totalHt: float
    totalVat: float
    totalTtc: float
    createdAt: datetime


class CreditNoteResponse(CamelModel):
    id: int
    uuid: str
    creditNoteNumber: str
    sourceInvoiceId: int
    sourceInvoiceNumber: Optional[str] = None
    creditNoteTypeCode: str
    reason: str
    refundMethod: str
    refundedAt: Optional[date] = None
    issuedAt: datetime
    serviceDate: Optional[date] = None
    # Issuer snapshot
    issuerName: Optional[str] = None
    issuerSiren: Optional[str] = None
    issuerSiret: Optional[str] = None
    issuerRcsCity: Optional[str] = None
    issuerVatIntracom: Optional[str] = None
    issuerNafCode: Optional[str] = None
    issuerAddressLine1: Optional[str] = None
    issuerPostalCode: Optional[str] = None
    issuerCity: Optional[str] = None
    issuerCountryCode: Optional[str] = None
    issuerIban: Optional[str] = None
    issuerBic: Optional[str] = None
    # Client snapshot
    clientType: Optional[str] = None
    clientName: Optional[str] = None
    clientFirstName: Optional[str] = None
    clientLegalName: Optional[str] = None
    clientSiren: Optional[str] = None
    clientVatIntracom: Optional[str] = None
    clientAddressLine1: Optional[str] = None
    clientAddressLine2: Optional[str] = None
    clientPostalCode: Optional[str] = None
    clientCity: Optional[str] = None
    clientCountryCode: Optional[str] = None
    clientEmail: Optional[str] = None
    clientPhone: Optional[str] = None
    clientAccountNumber: Optional[str] = None
    receptionistName: Optional[str] = None
    # Vehicle snapshot
    vehicleLicensePlate: Optional[str] = None
    vehicleVin: Optional[str] = None
    vehicleMake: Optional[str] = None
    vehicleModel: Optional[str] = None
    vehicleKilometrage: Optional[int] = None
    # Amounts
    currencyCode: str = "EUR"
    subtotalHt: float
    globalDiscountPercent: float
    globalDiscountAmount: float
    totalHt: float
    totalVat: float
    totalTtc: float
    vatBreakdownJson: Optional[str] = None
    # Notices
    mediatorNotice: Optional[str] = None
    vatExemptionNotice: Optional[str] = None
    legalWarrantyNotice: Optional[str] = None
    # Meta
    pdfPath: Optional[str] = None
    createdAt: datetime
    createdByUserId: Optional[int] = None
    # Lines
    lines: list[CreditNoteLineResponse] = []
