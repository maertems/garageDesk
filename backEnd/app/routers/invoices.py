"""Invoices router — billing module. Lot F, reworked 022.

POST /invoices                 — issue invoice from a signed quote (+ its signed amendments)
GET  /invoices                 — list (sourceQuoteId | paymentStatus | search)
GET  /invoices/{id}            — full detail + lines
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import get_current_user
from app.database import db_cursor
from app.schemas.billing_invoices import (
    InvoiceIssueRequest,
    InvoiceListItem,
    InvoiceLineResponse,
    InvoiceResponse,
)
from app.services.billing_pdf import generate_invoice_pdf
from app.services.company_logo import fetch_logo
from app.services.invoice_service import issue_invoice

router = APIRouter(prefix="/invoices", tags=["invoices"])

_INV_COLS = (
    "id, uuid, invoiceNumber, sourceQuoteId, sourceAmendmentIdsJson, "
    "invoiceTypeCode, issuedAt, serviceDate, "
    "issuerName, issuerShareCapital, issuerSiren, issuerSiret, issuerRcsCity, "
    "issuerVatIntracom, issuerNafCode, issuerAddressLine1, issuerPostalCode, "
    "issuerCity, issuerCountryCode, issuerIban, issuerBic, "
    "clientType, clientName, clientFirstName, clientLegalName, "
    "clientSiren, clientSiret, clientVatIntracom, "
    "clientAddressLine1, clientAddressLine2, clientPostalCode, clientCity, clientCountryCode, "
    "clientEmail, clientPhone, "
    "vehicleLicensePlate, vehicleVin, vehicleMake, vehicleModel, vehicleKilometrage, "
    "currencyCode, subtotalHt, globalDiscountPercent, globalDiscountAmount, "
    "totalHt, totalVat, totalTtc, vatBreakdownJson, "
    "paymentTerms, paymentDueDate, expectedPaymentMethodCode, "
    "latePaymentNotice, recoveryIndemnityAmount, "
    "paymentStatus, amountPaid, "
    "mediatorNotice, vatExemptionNotice, legalWarrantyNotice, "
    "pdfPath, createdAt, createdByUserId"
)

_LINE_COLS = (
    "id, invoiceId, lineNumber, sourceDocumentId, sourceDocumentType, "
    "lineType, label, longDescription, quantity, unitCode, "
    "unitPriceHt, discountPercent, discountAmount, "
    "vatRate, facturXVatCategory, totalHt, totalVat, totalTtc, createdAt"
)


def _fetch_invoice_or_404(invoice_id: int) -> dict:
    cols = ", ".join(f"i.{c.strip()}" for c in _INV_COLS.split(","))
    with db_cursor() as cur:
        cur.execute(
            f"""SELECT {cols}, dq.documentNumber AS sourceQuoteNumber
                FROM invoices i
                LEFT JOIN documents dq ON dq.id = i.sourceQuoteId
                WHERE i.id = %s""",
            (invoice_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Invoice not found"})
    return row


def _fetch_lines(invoice_id: int) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_LINE_COLS} FROM invoiceLines WHERE invoiceId = %s ORDER BY lineNumber",
            (invoice_id,),
        )
        return cur.fetchall()


def _build_response(inv: dict) -> InvoiceResponse:
    lines = _fetch_lines(inv["id"])
    return InvoiceResponse(**inv, lines=[InvoiceLineResponse(**l) for l in lines])


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=InvoiceResponse,
    status_code=201,
    summary="Issue invoice from a signed quote",
    description=(
        "Aggregates the quote's lines plus its signed amendments, snapshots issuer/client/vehicle "
        "(from the quote's header), and generates a sequential invoice number. "
        "Idempotent check: a 409 is returned if the quote already has an invoice."
    ),
)
def create_invoice(data: InvoiceIssueRequest, current_user: dict = Depends(get_current_user)):
    # Idempotency guard: prevent double-invoicing
    with db_cursor() as cur:
        cur.execute("SELECT id FROM invoices WHERE sourceQuoteId = %s LIMIT 1", (data.sourceQuoteId,))
        existing = cur.fetchone()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "alreadyInvoiced", "message": f"Quote {data.sourceQuoteId} already has invoice id={existing['id']}"},
        )

    invoice_id = issue_invoice(
        source_quote_id=data.sourceQuoteId,
        service_date=data.serviceDate,
        payment_terms=data.paymentTerms,
        payment_due_date=data.paymentDueDate,
        expected_payment_method_code=data.expectedPaymentMethodCode,
        user_id=current_user.get("id"),
    )
    return _build_response(_fetch_invoice_or_404(invoice_id))


@router.get(
    "",
    response_model=list[InvoiceListItem],
    summary="List invoices",
    description="Filter by sourceQuoteId, paymentStatus, or free-text search on invoiceNumber/clientName.",
)
def list_invoices(
    source_quote_id: Optional[int] = Query(None, alias="sourceQuoteId"),
    payment_status: Optional[str] = Query(None, alias="paymentStatus"),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    conditions = []
    params: list = []

    if source_quote_id is not None:
        conditions.append("i.sourceQuoteId = %s")
        params.append(source_quote_id)
    if payment_status:
        conditions.append("i.paymentStatus = %s")
        params.append(payment_status)
    if search:
        conditions.append("(i.invoiceNumber LIKE %s OR i.clientName LIKE %s OR i.clientFirstName LIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    list_cols = (
        "i.id, i.uuid, i.invoiceNumber, i.sourceQuoteId, i.issuedAt, i.serviceDate, "
        "i.clientName, i.clientFirstName, i.vehicleLicensePlate, i.vehicleMake, i.vehicleModel, "
        "i.totalHt, i.totalVat, i.totalTtc, i.paymentStatus, i.amountPaid, i.createdAt"
    )
    with db_cursor() as cur:
        cur.execute(
            f"""SELECT {list_cols}, dq.documentNumber AS sourceQuoteNumber
                FROM invoices i
                LEFT JOIN documents dq ON dq.id = i.sourceQuoteId
                {where}
                ORDER BY i.issuedAt DESC, i.id DESC""",
            params,
        )
        rows = cur.fetchall()
    return [InvoiceListItem(**r) for r in rows]


@router.get("/{invoice_id}", response_model=InvoiceResponse, summary="Get invoice by id")
def get_invoice(invoice_id: int, current_user: dict = Depends(get_current_user)):
    return _build_response(_fetch_invoice_or_404(invoice_id))


@router.get(
    "/{invoice_id}/pdf",
    summary="Download invoice as PDF",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def download_invoice_pdf(invoice_id: int, current_user: dict = Depends(get_current_user)):
    inv = _fetch_invoice_or_404(invoice_id)
    lines = _fetch_lines(invoice_id)
    pdf_bytes = generate_invoice_pdf(inv, lines, fetch_logo())
    filename = f"{inv['invoiceNumber']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
