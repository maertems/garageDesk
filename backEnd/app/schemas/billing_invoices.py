"""Pydantic schemas for invoices and invoiceLines (Lot F)."""

from datetime import date, datetime
from typing import Optional

from app.schemas.common import CamelModel


class InvoiceIssueRequest(CamelModel):
    sourceQuoteId: int
    serviceDate: Optional[date] = None
    paymentTerms: Optional[str] = None
    paymentDueDate: Optional[date] = None
    expectedPaymentMethodCode: Optional[str] = None


class InvoiceLineResponse(CamelModel):
    id: int
    invoiceId: int
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


class InvoiceListItem(CamelModel):
    """Lightweight invoice for list views (no lines)."""
    id: int
    uuid: str
    invoiceNumber: str
    sourceQuoteId: int
    sourceQuoteNumber: Optional[str] = None
    issuedAt: datetime
    serviceDate: Optional[date] = None
    clientName: Optional[str] = None
    clientFirstName: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    vehicleMake: Optional[str] = None
    vehicleModel: Optional[str] = None
    totalHt: float
    totalVat: float
    totalTtc: float
    paymentStatus: str
    amountPaid: float
    createdAt: datetime


class InvoiceResponse(CamelModel):
    """Full invoice with all snapshot fields and lines."""
    id: int
    uuid: str
    invoiceNumber: str
    sourceQuoteId: int
    sourceQuoteNumber: Optional[str] = None
    sourceAmendmentIdsJson: Optional[str] = None
    invoiceTypeCode: str
    issuedAt: datetime
    serviceDate: Optional[date] = None
    # Issuer snapshot
    issuerName: Optional[str] = None
    issuerShareCapital: Optional[float] = None
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
    clientSiret: Optional[str] = None
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
    # Payment
    paymentTerms: Optional[str] = None
    paymentDueDate: Optional[date] = None
    expectedPaymentMethodCode: Optional[str] = None
    latePaymentNotice: Optional[str] = None
    recoveryIndemnityAmount: Optional[float] = None
    paymentStatus: str
    amountPaid: float
    # Notices
    mediatorNotice: Optional[str] = None
    vatExemptionNotice: Optional[str] = None
    legalWarrantyNotice: Optional[str] = None
    # Meta
    pdfPath: Optional[str] = None
    createdAt: datetime
    createdByUserId: Optional[int] = None
    # Lines
    lines: list[InvoiceLineResponse] = []
