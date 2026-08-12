"""Pydantic schemas for headers, documents, documentLines (Lot D, reworked 022)."""

from datetime import date, datetime
from typing import Optional

from app.schemas.common import CamelModel
from app.schemas.billing_common import DocumentType, DocumentStatus


# ── document lines ────────────────────────────────────────────────────────────

class DocumentLineCreate(CamelModel):
    sortOrder: int = 0
    lineType: Optional[str] = None
    articleId: Optional[int] = None
    label: str
    longDescription: Optional[str] = None
    quantity: float = 1.0
    unitCode: Optional[str] = None
    unitPriceHt: float = 0.0
    discountPercent: float = 0.0
    vatRate: float = 0.0
    facturXVatCategory: str = "S"


class DocumentLineResponse(CamelModel):
    id: int
    documentId: int
    sortOrder: int
    lineType: Optional[str] = None
    articleId: Optional[int] = None
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
    updatedAt: datetime


# ── documents ─────────────────────────────────────────────────────────────────

class DocumentCreate(CamelModel):
    """Create a billing document.

    - quoteAmendment: requires parentDocumentId (must point to a quote).
      headerId/clientId/vehicleId/kilometrage are not allowed — the header is
      inherited from the parent quote.
    - repairOrder / quote / counterSale (root documents): require either
      headerId (reuse an existing header, e.g. "create a quote from this
      repair order") OR clientId + vehicleId (+ optional kilometrage) to
      create a new header inline.
    """
    documentType: DocumentType
    parentDocumentId: Optional[int] = None
    headerId: Optional[int] = None
    clientId: Optional[int] = None
    vehicleId: Optional[int] = None
    kilometrage: Optional[int] = None
    validUntil: Optional[date] = None


class DocumentUpdate(CamelModel):
    validUntil: Optional[date] = None
    globalDiscountPercent: Optional[float] = None
    status: Optional[DocumentStatus] = None


class DocumentLinesReplace(CamelModel):
    """Bulk replace all lines of a draft document.

    globalDiscountPercent is applied to document totals; if omitted, the current
    value on the document is kept.
    """
    lines: list[DocumentLineCreate]
    globalDiscountPercent: Optional[float] = None


class DocumentResponse(CamelModel):
    id: int
    headerId: Optional[int] = None
    parentDocumentId: Optional[int] = None
    documentType: DocumentType
    documentNumber: str
    status: DocumentStatus
    validUntil: Optional[date] = None
    subtotalHt: float
    globalDiscountPercent: float
    globalDiscountAmount: float
    totalHt: float
    totalVat: float
    totalTtc: float
    signatureId: Optional[int] = None
    createdAt: datetime
    updatedAt: datetime
    lines: list[DocumentLineResponse] = []
    # Resolved header context: own headerId for root documents, or the parent
    # quote's headerId for amendments. Populated via SQL join, never stored
    # redundantly on the row itself.
    clientId: Optional[int] = None
    vehicleId: Optional[int] = None
    kilometrage: Optional[int] = None
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    vehicleBrand: Optional[str] = None
    vehicleModel: Optional[str] = None


class HeaderResponse(CamelModel):
    """Lightweight lookup used when creating a document from an existing
    header (e.g. "create a quote from this repair order")."""
    id: int
    clientId: int
    vehicleId: int
    kilometrage: Optional[int] = None
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
    vehicleLicensePlate: Optional[str] = None
    vehicleBrand: Optional[str] = None
    vehicleModel: Optional[str] = None
