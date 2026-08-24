"""Invoice issuance service — Lot F, reworked 022.

`issue_invoice()` is the single entry-point. It validates pre-conditions,
aggregates the quote's lines plus its signed amendments, snapshots
issuer/client/vehicle (from the quote's header), and atomically writes
invoice + lines inside one db_transaction.

For now, an invoice can only be issued from a single quote (+ its amendments) —
counterSale and repairOrder-only (diagnostic fee) invoicing are not wired yet.

Called from the POST /invoices route; raises HTTPException on any pre-condition
failure so the caller just returns its result directly.
"""

import json
import uuid as _uuid
from datetime import datetime

from fastapi import HTTPException

from app.database import db_cursor, db_transaction
from app.services.audit_service import log_event
from app.services.billing_settings import check_mandatory_fields
from app.services.billing_totals import compute_document
from app.services.numbering_service import next_number

# Maps billing document type → invoiceLine sourceDocumentType enum value
_SOURCE_TYPE_MAP: dict[str, str] = {
    "repairOrder":    "repairOrderDiagnostic",
    "quote":          "quote",
    "quoteAmendment": "quoteAmendment",
    "counterSale":    "counterSale",
}

# Clients table enum 'company' → invoice snapshot enum 'business'
_CLIENT_TYPE_MAP = {"individual": "individual", "company": "business"}


def _build_mediator_notice(cs: dict) -> str | None:
    name = cs.get("mediatorName") or ""
    contact = cs.get("mediatorUrl") or cs.get("mediatorAddress") or ""
    if not name:
        return None
    parts = [f"Médiateur de la consommation : {name}"]
    if contact:
        parts.append(contact)
    return " — ".join(parts)


def issue_invoice(
    source_quote_id: int,
    service_date=None,
    payment_terms: str | None = None,
    payment_due_date=None,
    expected_payment_method_code: str | None = None,
    user_id: int | None = None,
) -> int:
    """Issue an invoice from a signed quote (+ its signed amendments). Returns the new invoice id."""

    # ── 1. Load quote ──────────────────────────────────────────────────────────
    with db_cursor() as cur:
        cur.execute(
            "SELECT * FROM documents WHERE id = %s AND documentType = 'quote'",
            (source_quote_id,),
        )
        quote = cur.fetchone()
    if not quote:
        raise HTTPException(
            status_code=404,
            detail={"code": "notFound", "message": f"Quote {source_quote_id} not found"},
        )
    if quote["status"] != "signed":
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalidDocumentStatus",
                "message": f"Quote status is '{quote['status']}' — expected 'signed'",
            },
        )

    # ── 2. Load header (client/vehicle/kilometrage context) ──────────────────
    with db_cursor() as cur:
        cur.execute("SELECT * FROM headers WHERE id = %s", (quote["headerId"],))
        header = cur.fetchone()
    if not header:
        raise HTTPException(
            status_code=500,
            detail={"code": "missingHeader", "message": "Header not found for this quote"},
        )

    # ── 3. Load amendments — block if any is still awaiting signature ────────
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, status, createdAt FROM documents WHERE parentDocumentId = %s AND documentType = 'quoteAmendment' ORDER BY createdAt",
            (source_quote_id,),
        )
        amendments = cur.fetchall()
    if any(a["status"] == "issued" for a in amendments):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "amendmentAwaitingSignature",
                "message": "An amendment of this quote is issued but not yet signed or refused",
            },
        )
    signed_amendments = [a for a in amendments if a["status"] == "signed"]

    # ── 4. Company settings + mandatory-fields check ──────────────────────────
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
                "message": "Company settings incomplete — cannot issue invoice",
                "missingFields": missing,
            },
        )

    # ── 5. Client snapshot ────────────────────────────────────────────────────
    with db_cursor() as cur:
        cur.execute("SELECT * FROM clients WHERE id = %s", (header["clientId"],))
        cl = cur.fetchone()
    if not cl:
        raise HTTPException(
            status_code=500,
            detail={"code": "missingClient", "message": "Client not found for this header"},
        )

    # ── 5 bis. Réceptionnaire ─────────────────────────────────────────────────
    # Choisi à la main sur le devis ou l'OR ; la facture en fige le NOM. Un
    # identifiant serait fragile ici : l'employé peut être renommé ou supprimé, et
    # une facture remise au client ne doit plus changer.
    #
    # Absent tant que le document d'origine n'en porte pas — les devis créés avant la
    # migration 028, par exemple. La mention disparaît alors du PDF.
    receptionist_name = None
    if quote.get("receptionistEmployeeId"):
        with db_cursor() as cur:
            cur.execute(
                "SELECT firstName, lastName FROM employees WHERE id = %s",
                (quote["receptionistEmployeeId"],),
            )
            emp = cur.fetchone()
        if emp:
            receptionist_name = " ".join(
                filter(None, [(emp.get("lastName") or "").upper(), emp.get("firstName")])
            ).strip() or None

    # ── 6. Vehicle snapshot ───────────────────────────────────────────────────
    with db_cursor() as cur:
        cur.execute("SELECT * FROM vehicles WHERE id = %s", (header["vehicleId"],))
        vh = cur.fetchone()
    if not vh:
        raise HTTPException(
            status_code=500,
            detail={"code": "missingVehicle", "message": "Vehicle not found for this header"},
        )

    # ── 7. Gather lines from the quote and its signed amendments ─────────────
    all_raw_lines: list[dict] = []
    amendment_ids: list[int] = [a["id"] for a in signed_amendments]

    for doc in [quote, *signed_amendments]:
        with db_cursor() as cur:
            cur.execute(
                """
                SELECT dl.lineType, dl.label, dl.longDescription,
                       dl.quantity, dl.unitCode, dl.unitPriceHt, dl.discountPercent,
                       dl.discountAmount, dl.vatRate, dl.facturXVatCategory,
                       dl.totalHt, dl.totalVat, dl.totalTtc,
                       a.reference AS articleReference
                FROM documentLines dl
                LEFT JOIN articles a ON a.id = dl.articleId
                WHERE dl.documentId = %s
                ORDER BY dl.sortOrder, dl.id
                """,
                (doc["id"],),
            )
            for row in cur.fetchall():
                all_raw_lines.append({
                    **row,
                    "sourceDocumentId": doc["id"],
                    "sourceDocumentType": _SOURCE_TYPE_MAP.get(
                        "quote" if doc["id"] == quote["id"] else "quoteAmendment", "quote"
                    ),
                })

    # ── 6. Compute invoice totals ─────────────────────────────────────────────
    totals = compute_document(
        [{"totalHt": l["totalHt"], "vatRate": l["vatRate"], "facturXVatCategory": l["facturXVatCategory"]}
         for l in all_raw_lines],
        0,  # global discount is already applied at document level; invoice does not re-apply it
    )

    # ── 7. Build issuer / client / vehicle snapshots ──────────────────────────
    client_type_mapped = _CLIENT_TYPE_MAP.get(cl.get("clientType", "individual"), "individual")
    is_company = client_type_mapped == "business"
    client_name = cl.get("lastName") or ""
    client_first_name = cl.get("firstName") if not is_company else None
    client_legal_name = cl.get("lastName") if is_company else None

    vehicle_km = header.get("kilometrage") if header.get("kilometrage") is not None else vh.get("mileage")

    vat_exempt = bool(cs.get("vatExemption"))
    vat_exemption_notice = "TVA non applicable, art. 293 B du CGI" if vat_exempt else None
    mediator_notice = _build_mediator_notice(cs)
    legal_warranty_notice = (
        "Garantie légale de conformité (art. L217-4 à L217-28 C. conso.) "
        "et garantie contre les vices cachés (art. 1641 à 1649 C. civ.) applicables."
    )

    invoice_uuid = str(_uuid.uuid4())
    year = datetime.now().year

    # ── 8. Atomic transaction ─────────────────────────────────────────────────
    with db_transaction() as cur:
        _, invoice_number = next_number(cur, "invoice", year)

        cur.execute(
            """
            INSERT INTO invoices (
              uuid, invoiceNumber,
              sourceQuoteId, sourceAmendmentIdsJson,
              issuedAt, serviceDate,
              issuerName, issuerShareCapital, issuerSiren, issuerSiret, issuerRcsCity,
              issuerVatIntracom, issuerNafCode, issuerAddressLine1, issuerPostalCode,
              issuerCity, issuerCountryCode, issuerIban, issuerBic,
              clientType, clientName, clientFirstName, clientLegalName,
              clientSiren, clientVatIntracom,
              clientAddressLine1, clientPostalCode, clientCity, clientCountryCode,
              clientEmail, clientPhone, clientAccountNumber,
              receptionistName,
              vehicleLicensePlate, vehicleVin, vehicleMake, vehicleModel, vehicleKilometrage,
              subtotalHt, globalDiscountPercent, globalDiscountAmount,
              totalHt, totalVat, totalTtc, vatBreakdownJson,
              paymentTerms, paymentDueDate, expectedPaymentMethodCode,
              mediatorNotice, vatExemptionNotice, legalWarrantyNotice,
              paymentStatus, amountPaid, createdByUserId
            ) VALUES (
              %s,%s,
              %s,%s,
              NOW(3),%s,
              %s,%s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,
              %s,
              %s,%s,%s,%s,%s,
              %s,%s,%s,
              %s,%s,%s,%s,
              %s,%s,%s,
              %s,%s,%s,
              'unpaid',0.00,%s
            )
            """,
            (
                invoice_uuid, invoice_number,
                source_quote_id,
                json.dumps(amendment_ids) if amendment_ids else None,
                service_date,
                cs.get("name"), cs.get("shareCapital"), cs.get("siren"), cs.get("siretHeadquarters"), cs.get("rcsCity"),
                cs.get("vatIntracom"), cs.get("nafCode"), cs.get("addressLine1"), cs.get("postalCode"),
                cs.get("city"), cs.get("countryCode", "FR"), cs.get("iban"), cs.get("bic"),
                client_type_mapped, client_name, client_first_name, client_legal_name,
                cl.get("siren"), cl.get("vatNumber"),
                cl.get("address"), cl.get("postalCode"), cl.get("city"), "FR",
                cl.get("email"), cl.get("phone"), cl.get("accountNumber"),
                receptionist_name,
                vh.get("licensePlate"), vh.get("vin"), vh.get("brand"), vh.get("model"), vehicle_km,
                float(totals["subtotalHt"]), float(totals["globalDiscountPercent"]), float(totals["globalDiscountAmount"]),
                float(totals["totalHt"]), float(totals["totalVat"]), float(totals["totalTtc"]),
                json.dumps(totals["vatBreakdown"]),
                payment_terms, payment_due_date, expected_payment_method_code,
                mediator_notice, vat_exemption_notice, legal_warranty_notice,
                user_id,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        invoice_id = cur.fetchone()["id"]

        # Insert lines
        for idx, line in enumerate(all_raw_lines):
            cur.execute(
                """
                INSERT INTO invoiceLines (
                  invoiceId, lineNumber, sourceDocumentId, sourceDocumentType,
                  lineType, articleReference, label, longDescription,
                  quantity, unitCode, unitPriceHt, discountPercent, discountAmount,
                  vatRate, facturXVatCategory, totalHt, totalVat, totalTtc
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    invoice_id, idx + 1, line["sourceDocumentId"], line["sourceDocumentType"],
                    line.get("lineType"), line.get("articleReference"),
                    line["label"], line.get("longDescription"),
                    float(line["quantity"]), line.get("unitCode"),
                    float(line["unitPriceHt"]), float(line["discountPercent"]), float(line["discountAmount"]),
                    float(line["vatRate"]), line.get("facturXVatCategory", "S"),
                    float(line["totalHt"]), float(line["totalVat"]), float(line["totalTtc"]),
                ),
            )

        log_event(
            cur,
            event_type="invoice.issued",
            entity_type="invoice",
            entity_id=invoice_id,
            user_id=user_id,
            payload={"invoiceNumber": invoice_number, "sourceQuoteId": source_quote_id, "totalTtc": float(totals["totalTtc"])},
        )

    return invoice_id
