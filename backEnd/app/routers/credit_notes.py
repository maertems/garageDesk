"""Credit notes router — billing module. Lot I, reworked 022.

POST /creditNotes            — issue credit note from a source invoice
GET  /creditNotes            — list (sourceInvoiceId | search)
GET  /creditNotes/{id}       — full detail + lines
GET  /creditNotes/{id}/pdf   — PDF download
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.auth import get_current_user
from app.database import db_cursor
from app.schemas.billing_credit_notes import (
    CreditNoteCreate,
    CreditNoteListItem,
    CreditNoteLineResponse,
    CreditNoteResponse,
)
from app.services.billing_pdf import generate_credit_note_pdf
from app.services.credit_note_service import issue_credit_note

router = APIRouter(prefix="/creditNotes", tags=["credit-notes"])

_CN_COLS = (
    "id, uuid, creditNoteNumber, sourceInvoiceId, "
    "creditNoteTypeCode, reason, refundMethod, refundedAt, issuedAt, serviceDate, "
    "issuerName, issuerSiren, issuerSiret, issuerRcsCity, "
    "issuerVatIntracom, issuerNafCode, issuerAddressLine1, issuerPostalCode, "
    "issuerCity, issuerCountryCode, issuerIban, issuerBic, "
    "clientType, clientName, clientFirstName, clientLegalName, "
    "clientSiren, clientVatIntracom, "
    "clientAddressLine1, clientAddressLine2, clientPostalCode, clientCity, clientCountryCode, "
    "clientEmail, clientPhone, "
    "vehicleLicensePlate, vehicleVin, vehicleMake, vehicleModel, vehicleKilometrage, "
    "currencyCode, subtotalHt, globalDiscountPercent, globalDiscountAmount, "
    "totalHt, totalVat, totalTtc, vatBreakdownJson, "
    "mediatorNotice, vatExemptionNotice, legalWarrantyNotice, "
    "pdfPath, createdAt, createdByUserId"
)

_LINE_COLS = (
    "id, creditNoteId, lineNumber, sourceDocumentId, sourceDocumentType, "
    "lineType, label, longDescription, quantity, unitCode, "
    "unitPriceHt, discountPercent, discountAmount, "
    "vatRate, facturXVatCategory, totalHt, totalVat, totalTtc, createdAt"
)


def _fetch_cn_or_404(cn_id: int) -> dict:
    cols = ", ".join(f"cn.{c.strip()}" for c in _CN_COLS.split(","))
    with db_cursor() as cur:
        cur.execute(
            f"""SELECT {cols}, i.invoiceNumber AS sourceInvoiceNumber
                FROM creditNotes cn
                LEFT JOIN invoices i ON i.id = cn.sourceInvoiceId
                WHERE cn.id = %s""",
            (cn_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Credit note not found"})
    return row


def _fetch_lines(cn_id: int) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_LINE_COLS} FROM creditNoteLines WHERE creditNoteId = %s ORDER BY lineNumber",
            (cn_id,),
        )
        return cur.fetchall()


def _build_response(cn: dict) -> CreditNoteResponse:
    lines = _fetch_lines(cn["id"])
    return CreditNoteResponse(**cn, lines=[CreditNoteLineResponse(**l) for l in lines])


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=CreditNoteResponse,
    status_code=201,
    summary="Issue a credit note against a source invoice",
    description=(
        "If `lines` is empty, all lines from the source invoice are copied (full credit note). "
        "Snapshots issuer/client/vehicle from the source invoice."
    ),
)
def create_credit_note(data: CreditNoteCreate, current_user: dict = Depends(get_current_user)):
    cn_id = issue_credit_note(data, user_id=current_user.get("id"))
    return _build_response(_fetch_cn_or_404(cn_id))


@router.get(
    "",
    response_model=list[CreditNoteListItem],
    summary="List credit notes",
    description="Filter by sourceInvoiceId, or search on creditNoteNumber/clientName.",
)
def list_credit_notes(
    source_invoice_id: Optional[int] = Query(None, alias="sourceInvoiceId"),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    conditions = []
    params: list = []

    if source_invoice_id is not None:
        conditions.append("cn.sourceInvoiceId = %s")
        params.append(source_invoice_id)
    if search:
        conditions.append("(cn.creditNoteNumber LIKE %s OR cn.clientName LIKE %s)")
        like = f"%{search}%"
        params.extend([like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    list_cols = (
        "cn.id, cn.uuid, cn.creditNoteNumber, cn.sourceInvoiceId, "
        "cn.issuedAt, cn.reason, cn.refundMethod, cn.clientName, cn.clientFirstName, "
        "cn.vehicleLicensePlate, cn.vehicleMake, cn.vehicleModel, "
        "cn.totalHt, cn.totalVat, cn.totalTtc, cn.createdAt"
    )
    with db_cursor() as cur:
        cur.execute(
            f"""SELECT {list_cols}, i.invoiceNumber AS sourceInvoiceNumber
                FROM creditNotes cn
                LEFT JOIN invoices i ON i.id = cn.sourceInvoiceId
                {where}
                ORDER BY cn.issuedAt DESC, cn.id DESC""",
            params,
        )
        rows = cur.fetchall()
    return [CreditNoteListItem(**r) for r in rows]


@router.get("/{cn_id}", response_model=CreditNoteResponse, summary="Get credit note by id")
def get_credit_note(cn_id: int, current_user: dict = Depends(get_current_user)):
    return _build_response(_fetch_cn_or_404(cn_id))


@router.get(
    "/{cn_id}/pdf",
    summary="Download credit note as PDF",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def download_credit_note_pdf(cn_id: int, current_user: dict = Depends(get_current_user)):
    cn = _fetch_cn_or_404(cn_id)
    lines = _fetch_lines(cn_id)
    pdf_bytes = generate_credit_note_pdf(cn, lines)
    filename = f"{cn['creditNoteNumber']}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
