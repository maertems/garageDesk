"""Credit note issuance service — Lot I.

`issue_credit_note(data, user_id)` is the single entry-point.
If `data.lines` is empty, all lines from the source invoice are copied (full credit note).
Raises HTTPException on pre-condition failures.
"""

import json
import uuid as _uuid
from datetime import datetime

from fastapi import HTTPException

from app.database import db_cursor, db_transaction
from app.services.audit_service import log_event
from app.services.billing_settings import check_mandatory_fields
from app.services.billing_totals import compute_document, compute_line
from app.services.numbering_service import next_number

_VALID_REFUND_METHODS = {"commercialCredit", "wireTransferRefund", "cashRefund", "other"}


def issue_credit_note(data, user_id: int | None) -> int:
    """Issue a credit note against a source invoice. Returns the new creditNote id."""

    if data.refundMethod not in _VALID_REFUND_METHODS:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalidRefundMethod", "message": f"Unknown refund method '{data.refundMethod}'"},
        )

    # ── 1. Load source invoice ────────────────────────────────────────────────
    with db_cursor() as cur:
        cur.execute("SELECT * FROM invoices WHERE id = %s", (data.sourceInvoiceId,))
        inv = cur.fetchone()
    if not inv:
        raise HTTPException(
            status_code=404,
            detail={"code": "notFound", "message": f"Invoice {data.sourceInvoiceId} not found"},
        )

    # ── 2. Company settings check ─────────────────────────────────────────────
    with db_cursor() as cur:
        cur.execute("SELECT * FROM companySettings WHERE id = 1")
        cs = cur.fetchone()
    if not cs:
        raise HTTPException(
            status_code=422,
            detail={"code": "missingSettings", "message": "companySettings row id=1 not found"},
        )
    missing = check_mandatory_fields(cs)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "incompleteMandatoryFields",
                "message": "Company settings incomplete — cannot issue credit note",
                "missingFields": missing,
            },
        )

    # ── 3. Build lines ────────────────────────────────────────────────────────
    if data.lines:
        # Use provided lines, compute amounts server-side
        raw_lines = []
        for i, ln in enumerate(data.lines):
            c = compute_line(ln.quantity, ln.unitPriceHt, ln.discountPercent, ln.vatRate)
            raw_lines.append({
                "lineNumber": i + 1,
                "sourceDocumentId": ln.sourceDocumentId,
                "sourceDocumentType": ln.sourceDocumentType,
                "lineType": ln.lineType,
                "label": ln.label,
                "longDescription": ln.longDescription,
                "quantity": float(ln.quantity),
                "unitCode": ln.unitCode,
                "unitPriceHt": float(ln.unitPriceHt),
                "discountPercent": float(ln.discountPercent),
                "discountAmount": float(c["discountAmount"]),
                "vatRate": float(ln.vatRate),
                "facturXVatCategory": ln.facturXVatCategory,
                "totalHt": float(c["totalHt"]),
                "totalVat": float(c["totalVat"]),
                "totalTtc": float(c["totalTtc"]),
            })
    else:
        # Full credit note: copy all invoice lines
        with db_cursor() as cur:
            cur.execute(
                """
                SELECT lineNumber, sourceDocumentId, sourceDocumentType, lineType,
                       label, longDescription, quantity, unitCode,
                       unitPriceHt, discountPercent, discountAmount,
                       vatRate, facturXVatCategory, totalHt, totalVat, totalTtc
                FROM invoiceLines WHERE invoiceId = %s ORDER BY lineNumber
                """,
                (data.sourceInvoiceId,),
            )
            raw_lines = [dict(r) for r in cur.fetchall()]

    # ── 4. Compute totals ─────────────────────────────────────────────────────
    totals = compute_document(
        [{"totalHt": l["totalHt"], "vatRate": l["vatRate"], "facturXVatCategory": l["facturXVatCategory"]}
         for l in raw_lines],
        0,
    )

    # ── 5. Notices (copy from invoice) ────────────────────────────────────────
    cn_uuid = str(_uuid.uuid4())
    year = datetime.now().year

    # ── 6. Atomic transaction ─────────────────────────────────────────────────
    with db_transaction() as cur:
        _, cn_number = next_number(cur, "creditNote", year)

        cur.execute(
            """
            INSERT INTO creditNotes (
              uuid, creditNoteNumber, sourceInvoiceId,
              reason, refundMethod, refundedAt, issuedAt, serviceDate,
              issuerName, issuerShareCapital, issuerSiren, issuerSiret, issuerRcsCity,
              issuerVatIntracom, issuerNafCode, issuerAddressLine1, issuerPostalCode,
              issuerCity, issuerCountryCode, issuerIban, issuerBic,
              clientType, clientName, clientFirstName, clientLegalName,
              clientSiren, clientVatIntracom,
              clientAddressLine1, clientAddressLine2, clientPostalCode, clientCity, clientCountryCode,
              clientEmail, clientPhone,
              vehicleLicensePlate, vehicleVin, vehicleMake, vehicleModel, vehicleKilometrage,
              subtotalHt, globalDiscountPercent, globalDiscountAmount,
              totalHt, totalVat, totalTtc, vatBreakdownJson,
              mediatorNotice, vatExemptionNotice, legalWarrantyNotice,
              createdByUserId
            ) VALUES (
              %s,%s,%s,
              %s,%s,%s,NOW(3),%s,
              %s,%s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,
              %s,%s,%s,%s,%s,
              %s,%s,
              %s,%s,%s,%s,%s,
              %s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,
              %s
            )
            """,
            (
                cn_uuid, cn_number, data.sourceInvoiceId,
                data.reason, data.refundMethod, data.refundedAt, data.serviceDate,
                inv.get("issuerName"), inv.get("issuerShareCapital"), inv.get("issuerSiren"), inv.get("issuerSiret"), inv.get("issuerRcsCity"),
                inv.get("issuerVatIntracom"), inv.get("issuerNafCode"), inv.get("issuerAddressLine1"), inv.get("issuerPostalCode"),
                inv.get("issuerCity"), inv.get("issuerCountryCode", "FR"), inv.get("issuerIban"), inv.get("issuerBic"),
                inv.get("clientType"), inv.get("clientName"), inv.get("clientFirstName"), inv.get("clientLegalName"),
                inv.get("clientSiren"), inv.get("clientVatIntracom"),
                inv.get("clientAddressLine1"), inv.get("clientAddressLine2"), inv.get("clientPostalCode"), inv.get("clientCity"), inv.get("clientCountryCode", "FR"),
                inv.get("clientEmail"), inv.get("clientPhone"),
                inv.get("vehicleLicensePlate"), inv.get("vehicleVin"), inv.get("vehicleMake"), inv.get("vehicleModel"), inv.get("vehicleKilometrage"),
                float(totals["subtotalHt"]), float(totals["globalDiscountPercent"]), float(totals["globalDiscountAmount"]),
                float(totals["totalHt"]), float(totals["totalVat"]), float(totals["totalTtc"]),
                json.dumps(totals["vatBreakdown"]),
                inv.get("mediatorNotice"), inv.get("vatExemptionNotice"), inv.get("legalWarrantyNotice"),
                user_id,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        cn_id = cur.fetchone()["id"]

        for ln in raw_lines:
            cur.execute(
                """
                INSERT INTO creditNoteLines (
                  creditNoteId, lineNumber, sourceDocumentId, sourceDocumentType,
                  lineType, label, longDescription,
                  quantity, unitCode, unitPriceHt, discountPercent, discountAmount,
                  vatRate, facturXVatCategory, totalHt, totalVat, totalTtc
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    cn_id, ln["lineNumber"], ln.get("sourceDocumentId"), ln.get("sourceDocumentType"),
                    ln.get("lineType"), ln["label"], ln.get("longDescription"),
                    float(ln["quantity"]), ln.get("unitCode"),
                    float(ln["unitPriceHt"]), float(ln["discountPercent"]), float(ln["discountAmount"]),
                    float(ln["vatRate"]), ln.get("facturXVatCategory", "S"),
                    float(ln["totalHt"]), float(ln["totalVat"]), float(ln["totalTtc"]),
                ),
            )

        log_event(
            cur,
            event_type="creditNote.issued",
            entity_type="creditNote",
            entity_id=cn_id,
            user_id=user_id,
            payload={"creditNoteNumber": cn_number, "sourceInvoiceId": data.sourceInvoiceId, "totalTtc": float(totals["totalTtc"])},
        )

    return cn_id
