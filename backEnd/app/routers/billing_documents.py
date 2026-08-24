"""Billing documents router (OR / quote / amendment / counterSale) — Lot D, reworked 022.

NOTE: this is the billing `documents` table, NOT the imported `bills` (/documents page).

GET  /documents                  — list, optional filters (headerId, parentDocumentId, documentType, status, search)
GET  /documents/{id}              — detail + lines
POST /documents                   — create (validate, generate number) → draft
PATCH /documents/{id}             — update validUntil/globalDiscountPercent/status
PUT  /documents/{id}/lines        — bulk replace all lines (draft only), recompute totals
DELETE /documents/{id}            — draft only

Headers: root documents (repairOrder, quote, counterSale) carry their own
headerId. quoteAmendment has none — its header is resolved via
parentDocumentId → parent quote. All read queries use a self-join to resolve
this transparently (see _DOC_QUERY).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.database import db_cursor, db_transaction
from app.schemas.billing_documents import (
    DocumentCreate,
    DocumentLinesReplace,
    DocumentResponse,
    DocumentUpdate,
    DocumentLineResponse,
)
from app.services.audit_service import log_event
from app.services.billing_totals import compute_document, compute_line
from app.services.numbering_service import next_number

router = APIRouter(prefix="/documents", tags=["billing-documents"])

# series code per documentType
_DOC_SERIES = {
    "repairOrder":    "repairOrder",
    "quote":          "quote",
    "quoteAmendment": "amendment",
    "counterSale":    "counterSale",
}

# Allowed document status transitions
_DOC_TRANSITIONS: dict[str, set[str]] = {
    "draft":    {"issued"},
    "issued":   {"signed", "refused", "expired"},
    "signed":   {"obsolete"},
    "refused":  set(),
    "expired":  set(),
    "obsolete": set(),
}

_DOC_COLS = (
    "id, headerId, receptionistEmployeeId, parentDocumentId, documentType, documentNumber, status, "
    "validUntil, subtotalHt, globalDiscountPercent, globalDiscountAmount, "
    "totalHt, totalVat, totalTtc, signatureId, createdAt, updatedAt"
)
_LINE_COLS = (
    "id, documentId, sortOrder, lineType, articleId, label, longDescription, "
    "quantity, unitCode, unitPriceHt, discountPercent, discountAmount, "
    "vatRate, facturXVatCategory, totalHt, totalVat, totalTtc, createdAt, updatedAt"
)

# Resolves client/vehicle/kilometrage for any document: root documents via
# their own headerId, amendments via their parent quote's headerId.
_DOC_QUERY = f"""
    SELECT {", ".join(f"d.{c.strip()}" for c in _DOC_COLS.split(","))},
           h.clientId, h.vehicleId, h.kilometrage,
           c.firstName AS clientFirstName, c.lastName AS clientLastName,
           v.licensePlate AS vehicleLicensePlate, v.brand AS vehicleBrand, v.model AS vehicleModel
    FROM documents d
    LEFT JOIN documents pd ON pd.id = d.parentDocumentId
    LEFT JOIN headers h ON h.id = COALESCE(d.headerId, pd.headerId)
    LEFT JOIN clients c ON c.id = h.clientId
    LEFT JOIN vehicles v ON v.id = h.vehicleId
"""


def _fetch_doc_or_404(doc_id: int) -> dict:
    with db_cursor() as cur:
        cur.execute(_DOC_QUERY + " WHERE d.id = %s", (doc_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Document not found"})
    return row


def _fetch_lines(doc_id: int) -> list[dict]:
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_LINE_COLS} FROM documentLines WHERE documentId = %s ORDER BY sortOrder, id",
            (doc_id,),
        )
        return cur.fetchall()


def _build_response(doc: dict) -> DocumentResponse:
    lines = _fetch_lines(doc["id"])
    return DocumentResponse(**doc, lines=[DocumentLineResponse(**l) for l in lines])


def _recompute_and_save(doc_id: int, global_pct: float | None = None) -> None:
    """Recompute document totals from current lines and save to DB."""
    with db_cursor() as cur:
        cur.execute("SELECT globalDiscountPercent FROM documents WHERE id = %s", (doc_id,))
        doc_row = cur.fetchone()
    pct = global_pct if global_pct is not None else float(doc_row["globalDiscountPercent"])
    lines = _fetch_lines(doc_id)
    totals = compute_document(
        [{"totalHt": l["totalHt"], "vatRate": l["vatRate"], "facturXVatCategory": l["facturXVatCategory"]}
         for l in lines],
        pct,
    )
    with db_cursor(commit=True) as cur:
        cur.execute(
            """UPDATE documents SET
                subtotalHt=%s, globalDiscountPercent=%s, globalDiscountAmount=%s,
                totalHt=%s, totalVat=%s, totalTtc=%s
               WHERE id=%s""",
            (
                float(totals["subtotalHt"]),
                float(totals["globalDiscountPercent"]),
                float(totals["globalDiscountAmount"]),
                float(totals["totalHt"]),
                float(totals["totalVat"]),
                float(totals["totalTtc"]),
                doc_id,
            ),
        )


def _assert_draft(doc: dict) -> None:
    if doc["status"] != "draft":
        raise HTTPException(
            status_code=422,
            detail={"code": "immutable", "message": f"Document is '{doc['status']}' — only draft documents can be edited"},
        )


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[DocumentResponse],
    summary="List billing documents",
    description=(
        "All filters are optional and combinable. headerId lists documents sharing a "
        "header (a root document and quotes created from it). parentDocumentId lists "
        "the amendments of a quote. With no filter, lists every document (summary view, "
        "no lines — see GET /documents/{id} for full detail)."
    ),
)
def list_documents(
    header_id: Optional[int] = Query(None, alias="headerId"),
    parent_document_id: Optional[int] = Query(None, alias="parentDocumentId"),
    document_type: Optional[str] = Query(None, alias="documentType"),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    conditions = []
    params: list = []

    if header_id is not None:
        conditions.append("COALESCE(d.headerId, pd.headerId) = %s")
        params.append(header_id)
    if parent_document_id is not None:
        conditions.append("d.parentDocumentId = %s")
        params.append(parent_document_id)
    if document_type:
        conditions.append("d.documentType = %s")
        params.append(document_type)
    if status:
        conditions.append("d.status = %s")
        params.append(status)
    if search:
        conditions.append(
            "(d.documentNumber LIKE %s OR c.lastName LIKE %s OR c.firstName LIKE %s OR v.licensePlate LIKE %s)"
        )
        like = f"%{search}%"
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with db_cursor() as cur:
        cur.execute(f"{_DOC_QUERY} {where} ORDER BY d.createdAt DESC", params)
        rows = cur.fetchall()
    return [DocumentResponse(**r, lines=[]) for r in rows]


@router.get("/{doc_id}", response_model=DocumentResponse, summary="Get billing document by id")
def get_document(doc_id: int, current_user: dict = Depends(get_current_user)):
    return _build_response(_fetch_doc_or_404(doc_id))


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=201,
    summary="Create billing document",
    description=(
        "Creates a document in draft status with a sequential number. "
        "quoteAmendment requires parentDocumentId pointing to a quote. "
        "Root documents (repairOrder, quote, counterSale) require either headerId "
        "(reuse an existing header) or clientId+vehicleId (creates a new header)."
    ),
)
def create_document(data: DocumentCreate, current_user: dict = Depends(get_current_user)):
    header_id: Optional[int] = None
    parent_document_id: Optional[int] = None
    new_header_client_id: Optional[int] = None
    new_header_vehicle_id: Optional[int] = None

    if data.documentType == "quoteAmendment":
        if not data.parentDocumentId:
            raise HTTPException(
                status_code=422,
                detail={"code": "missingParent", "message": "quoteAmendment requires parentDocumentId"},
            )
        if data.headerId is not None or data.clientId is not None or data.vehicleId is not None:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "unexpectedHeaderFields",
                    "message": "quoteAmendment inherits its header from the parent quote — do not pass headerId/clientId/vehicleId",
                },
            )
        with db_cursor() as cur:
            cur.execute(
                "SELECT id, documentType FROM documents WHERE id = %s",
                (data.parentDocumentId,),
            )
            parent = cur.fetchone()
        if not parent:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalidReference", "message": f"parentDocument {data.parentDocumentId} not found"},
            )
        if parent["documentType"] != "quote":
            raise HTTPException(
                status_code=422,
                detail={"code": "invalidParentType", "message": "Parent document must be a quote"},
            )
        parent_document_id = data.parentDocumentId

    else:
        if data.parentDocumentId:
            raise HTTPException(
                status_code=422,
                detail={"code": "unexpectedParent", "message": "parentDocumentId is only allowed for quoteAmendment"},
            )
        if data.headerId is not None:
            if data.clientId is not None or data.vehicleId is not None:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "conflictingHeaderInput",
                        "message": "Pass either headerId or clientId+vehicleId, not both",
                    },
                )
            with db_cursor() as cur:
                cur.execute("SELECT id FROM headers WHERE id = %s", (data.headerId,))
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=422,
                        detail={"code": "invalidReference", "message": f"Header {data.headerId} not found"},
                    )
            header_id = data.headerId
        else:
            if not data.clientId or not data.vehicleId:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "missingHeaderInfo",
                        "message": "clientId and vehicleId are required to create a new header",
                    },
                )
            with db_cursor() as cur:
                cur.execute("SELECT id FROM clients WHERE id = %s", (data.clientId,))
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=422,
                        detail={"code": "invalidReference", "message": f"Client {data.clientId} not found"},
                    )
                cur.execute("SELECT id, clientId FROM vehicles WHERE id = %s", (data.vehicleId,))
                vehicle_row = cur.fetchone()
                if not vehicle_row:
                    raise HTTPException(
                        status_code=422,
                        detail={"code": "invalidReference", "message": f"Vehicle {data.vehicleId} not found"},
                    )
                if vehicle_row["clientId"] != data.clientId:
                    raise HTTPException(
                        status_code=422,
                        detail={"code": "vehicleClientMismatch", "message": "Vehicle does not belong to the given client"},
                    )
            new_header_client_id = data.clientId
            new_header_vehicle_id = data.vehicleId

    year = datetime.now().year
    series = _DOC_SERIES[data.documentType]

    with db_transaction() as cur:
        if header_id is None and parent_document_id is None:
            cur.execute(
                "INSERT INTO headers (clientId, vehicleId, kilometrage) VALUES (%s, %s, %s)",
                (new_header_client_id, new_header_vehicle_id, data.kilometrage),
            )
            cur.execute("SELECT LAST_INSERT_ID() AS id")
            header_id = cur.fetchone()["id"]

        _, doc_number = next_number(cur, series, year)
        cur.execute(
            """
            INSERT INTO documents
              (headerId, receptionistEmployeeId, parentDocumentId, documentType,
               documentNumber, status, validUntil)
            VALUES (%s, %s, %s, %s, %s, 'draft', %s)
            """,
            (header_id, data.receptionistEmployeeId, parent_document_id,
             data.documentType, doc_number, data.validUntil),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        new_id = cur.fetchone()["id"]

    return _build_response(_fetch_doc_or_404(new_id))


@router.patch(
    "/{doc_id}",
    response_model=DocumentResponse,
    summary="Update billing document fields or status",
    description="Status transitions are validated. Content fields (validUntil, globalDiscountPercent) are only writable when draft.",
)
def update_document(doc_id: int, data: DocumentUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return _build_response(_fetch_doc_or_404(doc_id))

    doc = _fetch_doc_or_404(doc_id)

    new_status = updates.get("status")
    if new_status and new_status != doc["status"]:
        allowed = _DOC_TRANSITIONS.get(doc["status"], set())
        if new_status not in allowed:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "invalidTransition",
                    "message": f"Cannot transition from '{doc['status']}' to '{new_status}'",
                },
            )

    # Content fields require draft status
    content_fields = {"validUntil", "globalDiscountPercent"}
    if content_fields & updates.keys():
        _assert_draft(doc)

    new_pct = updates.pop("globalDiscountPercent", None)
    if new_pct is not None and not (0 <= new_pct <= 100):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalidDiscount", "message": "globalDiscountPercent must be between 0 and 100"},
        )

    if updates:
        set_clause = ", ".join(f"`{k}` = %s" for k in updates)
        values = list(updates.values()) + [doc_id]
        with db_cursor(commit=True) as cur:
            cur.execute(f"UPDATE documents SET {set_clause} WHERE id = %s", values)
            if new_status and new_status != doc["status"]:
                log_event(
                    cur,
                    event_type="document.statusChanged",
                    entity_type="document",
                    entity_id=doc_id,
                    user_id=current_user.get("id"),
                    payload={"fromStatus": doc["status"], "toStatus": new_status, "documentType": doc["documentType"]},
                )

    if new_pct is not None:
        _recompute_and_save(doc_id, new_pct)

    return _build_response(_fetch_doc_or_404(doc_id))


@router.put(
    "/{doc_id}/lines",
    response_model=DocumentResponse,
    summary="Replace all lines of a draft document",
    description="Atomically replaces all lines, optionally updates globalDiscountPercent, and recomputes totals.",
)
def replace_lines(doc_id: int, data: DocumentLinesReplace, current_user: dict = Depends(get_current_user)):
    doc = _fetch_doc_or_404(doc_id)
    _assert_draft(doc)

    if data.globalDiscountPercent is not None and not (0 <= data.globalDiscountPercent <= 100):
        raise HTTPException(
            status_code=422,
            detail={"code": "invalidDiscount", "message": "globalDiscountPercent must be between 0 and 100"},
        )

    global_pct = data.globalDiscountPercent if data.globalDiscountPercent is not None else float(doc["globalDiscountPercent"])

    # Compute all line amounts server-side
    computed_lines = []
    for i, line in enumerate(data.lines):
        c = compute_line(line.quantity, line.unitPriceHt, line.discountPercent, line.vatRate)
        computed_lines.append((line, c, i))

    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM documentLines WHERE documentId = %s", (doc_id,))
        for line, c, _ in computed_lines:
            cur.execute(
                """
                INSERT INTO documentLines
                  (documentId, sortOrder, lineType, articleId, label, longDescription,
                   quantity, unitCode, unitPriceHt, discountPercent, discountAmount,
                   vatRate, facturXVatCategory, totalHt, totalVat, totalTtc)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    doc_id,
                    line.sortOrder,
                    line.lineType,
                    line.articleId,
                    line.label,
                    line.longDescription,
                    float(line.quantity),
                    line.unitCode,
                    float(line.unitPriceHt),
                    float(line.discountPercent),
                    float(c["discountAmount"]),
                    float(line.vatRate),
                    line.facturXVatCategory,
                    float(c["totalHt"]),
                    float(c["totalVat"]),
                    float(c["totalTtc"]),
                ),
            )

    _recompute_and_save(doc_id, global_pct)
    return _build_response(_fetch_doc_or_404(doc_id))


@router.delete(
    "/{doc_id}",
    status_code=204,
    summary="Delete a draft document",
    description="Only documents in draft status can be deleted.",
)
def delete_document(doc_id: int, current_user: dict = Depends(get_current_user)):
    doc = _fetch_doc_or_404(doc_id)
    _assert_draft(doc)
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM documentLines WHERE documentId = %s", (doc_id,))
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
