"""Edge case tests — Lot J.

- Double-sign attempt (422)
- globalDiscountPercent hors [0,100] (422)
- Immutabilité : pas de PUT/PATCH/DELETE sur invoices, creditNotes et leurs lignes
- Transition auto dossier → closed quand facture fully paid
"""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _setup_company(client: AsyncClient, headers: dict):
    await client.patch(
        "/api/v1/companySettings",
        headers=headers,
        json={
            "name": "GarageDesk SAS",
            "siren": "123456789",
            "siretHeadquarters": "12345678900012",
            "rcsCity": "Lille",
            "addressLine1": "1 rue des Acacias",
            "postalCode": "59000",
            "city": "Lille",
            "mediatorName": "Médiateur Auto",
            "mediatorUrl": "https://mediateur-auto.fr",
            "vatIntracom": "FR12123456789",
        },
    )


async def _create_issued_doc(client: AsyncClient, headers: dict, plate: str, doc_type="repairOrder") -> dict:
    """Return {'caseId': ..., 'docId': ..., 'caseStatus': ...}."""
    rc = await client.post(
        "/api/v1/clients", headers=headers,
        json={"firstName": "Edge", "lastName": "Test", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=headers,
        json={"clientId": rc.json()["id"], "licensePlate": plate},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    rd = await client.post(
        "/api/v1/documents", headers=headers,
        json={"serviceCaseId": case_id, "documentType": doc_type},
    )
    doc_id = rd.json()["id"]
    await client.patch(f"/api/v1/documents/{doc_id}", headers=headers, json={"status": "issued"})
    return {"caseId": case_id, "docId": doc_id}


async def _issue_invoice(client: AsyncClient, headers: dict, plate: str) -> dict:
    """Return {id, serviceCaseId, totalTtc} for a newly issued invoice (60 HT / 72 TTC)."""
    rc = await client.post(
        "/api/v1/clients", headers=headers,
        json={"firstName": "Inv", "lastName": "Edge", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=headers,
        json={"clientId": rc.json()["id"], "licensePlate": plate},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    rd = await client.post(
        "/api/v1/documents", headers=headers,
        json={"serviceCaseId": case_id, "documentType": "repairOrder"},
    )
    doc_id = rd.json()["id"]
    await client.put(
        f"/api/v1/documents/{doc_id}/lines", headers=headers,
        json={"lines": [{"sortOrder": 0, "lineType": "service", "label": "MO",
                         "quantity": 1, "unitCode": "HUR", "unitPriceHt": 60.00,
                         "discountPercent": 0, "vatRate": 20.00, "facturXVatCategory": "S"}]},
    )
    await client.patch(f"/api/v1/documents/{doc_id}", headers=headers, json={"status": "issued"})
    await client.post(
        "/api/v1/signatures", headers=headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "E Client",
              "signerEmail": "e@test.fr", "method": "emailApproval"},
    )
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "workCompleted"})

    ri = await client.post(
        "/api/v1/invoices", headers=headers,
        json={"serviceCaseId": case_id},
    )
    assert ri.status_code == 201, ri.text
    inv = ri.json()
    return {"id": inv["id"], "serviceCaseId": case_id, "totalTtc": inv["totalTtc"]}


# ── double-sign ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_double_sign_returns_422(client: AsyncClient, auth_headers: dict):
    """Signing an already-signed document returns 422 notIssued."""
    ctx = await _create_issued_doc(client, auth_headers, "EC-001-ZZ")
    doc_id = ctx["docId"]

    sig_payload = {
        "documentId": doc_id, "signerType": "client",
        "signerName": "First Sign", "signerEmail": "a@test.fr",
        "method": "emailApproval",
    }
    r1 = await client.post("/api/v1/signatures", headers=auth_headers, json=sig_payload)
    assert r1.status_code == 201

    # Second attempt on the same document (now status=signed)
    r2 = await client.post("/api/v1/signatures", headers=auth_headers, json={
        **sig_payload, "signerName": "Second Sign",
    })
    assert r2.status_code == 422
    assert r2.json()["detail"]["code"] == "notIssued"


# ── globalDiscountPercent validation ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_patch_document_discount_above_100_rejected(client: AsyncClient, auth_headers: dict):
    """PATCH /documents/{id} with globalDiscountPercent > 100 returns 422."""
    ctx = await _create_issued_doc(client, auth_headers, "EC-002-ZZ", doc_type="quote")
    # Re-read to get a fresh draft doc
    rc = await client.post(
        "/api/v1/clients", headers=auth_headers,
        json={"firstName": "Disc", "lastName": "Test", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "EC-002B-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    rd = await client.post(
        "/api/v1/documents", headers=auth_headers,
        json={"serviceCaseId": rs.json()["id"], "documentType": "quote"},
    )
    doc_id = rd.json()["id"]

    r = await client.patch(
        f"/api/v1/documents/{doc_id}", headers=auth_headers,
        json={"globalDiscountPercent": 101.0},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidDiscount"


@pytest.mark.asyncio
async def test_patch_document_discount_negative_rejected(client: AsyncClient, auth_headers: dict):
    """PATCH /documents/{id} with globalDiscountPercent < 0 returns 422."""
    rc = await client.post(
        "/api/v1/clients", headers=auth_headers,
        json={"firstName": "Disc2", "lastName": "Test", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "EC-003-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    rd = await client.post(
        "/api/v1/documents", headers=auth_headers,
        json={"serviceCaseId": rs.json()["id"], "documentType": "quote"},
    )
    doc_id = rd.json()["id"]

    r = await client.patch(
        f"/api/v1/documents/{doc_id}", headers=auth_headers,
        json={"globalDiscountPercent": -5.0},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidDiscount"


@pytest.mark.asyncio
async def test_replace_lines_discount_above_100_rejected(client: AsyncClient, auth_headers: dict):
    """PUT /documents/{id}/lines with globalDiscountPercent > 100 returns 422."""
    rc = await client.post(
        "/api/v1/clients", headers=auth_headers,
        json={"firstName": "LineDisc", "lastName": "Test", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "EC-004-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    rd = await client.post(
        "/api/v1/documents", headers=auth_headers,
        json={"serviceCaseId": rs.json()["id"], "documentType": "quote"},
    )
    doc_id = rd.json()["id"]

    r = await client.put(
        f"/api/v1/documents/{doc_id}/lines", headers=auth_headers,
        json={
            "globalDiscountPercent": 150.0,
            "lines": [{"sortOrder": 0, "lineType": "service", "label": "X",
                       "quantity": 1, "unitCode": "U", "unitPriceHt": 10,
                       "discountPercent": 0, "vatRate": 20, "facturXVatCategory": "S"}],
        },
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidDiscount"


# ── immutability: invoices ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invoice_no_put(client: AsyncClient, auth_headers: dict):
    """PUT /invoices/{id} does not exist (405 or 404)."""
    r = await client.put("/api/v1/invoices/1", headers=auth_headers, json={})
    assert r.status_code in (404, 405)


@pytest.mark.asyncio
async def test_invoice_no_patch(client: AsyncClient, auth_headers: dict):
    """PATCH /invoices/{id} does not exist (405 or 404)."""
    r = await client.patch("/api/v1/invoices/1", headers=auth_headers, json={})
    assert r.status_code in (404, 405)


@pytest.mark.asyncio
async def test_invoice_no_delete(client: AsyncClient, auth_headers: dict):
    """DELETE /invoices/{id} does not exist (405 or 404)."""
    r = await client.delete("/api/v1/invoices/1", headers=auth_headers)
    assert r.status_code in (404, 405)


@pytest.mark.asyncio
async def test_invoice_lines_no_patch(client: AsyncClient, auth_headers: dict):
    """PATCH /invoices/{id}/lines does not exist."""
    r = await client.patch("/api/v1/invoices/1/lines", headers=auth_headers, json={})
    assert r.status_code in (404, 405)


# ── immutability: credit notes ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_credit_note_no_patch(client: AsyncClient, auth_headers: dict):
    """PATCH /creditNotes/{id} does not exist (405 or 404)."""
    r = await client.patch("/api/v1/creditNotes/1", headers=auth_headers, json={})
    assert r.status_code in (404, 405)


@pytest.mark.asyncio
async def test_credit_note_no_delete(client: AsyncClient, auth_headers: dict):
    """DELETE /creditNotes/{id} does not exist (405 or 404)."""
    r = await client.delete("/api/v1/creditNotes/1", headers=auth_headers)
    assert r.status_code in (404, 405)


# ── auto case → closed when invoice paid ─────────────────────────────────────

@pytest.mark.asyncio
async def test_auto_close_case_on_full_payment(client: AsyncClient, auth_headers: dict):
    """Fully paying an invoice automatically transitions the service case to 'closed'."""
    await _setup_company(client, auth_headers)
    ctx = await _issue_invoice(client, auth_headers, "EC-010-ZZ")
    inv_id = ctx["id"]
    case_id = ctx["serviceCaseId"]
    total_ttc = ctx["totalTtc"]

    # Case should be 'invoiced' at this point
    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "invoiced"

    # Fully pay the invoice
    rp = await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": total_ttc, "paymentMethod": "card"},
    )
    assert rp.status_code == 201

    # Invoice should be 'paid'
    ri = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert ri.json()["paymentStatus"] == "paid"

    # Case should auto-transition to 'closed'
    rc2 = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc2.json()["status"] == "closed", f"Expected 'closed', got '{rc2.json()['status']}'"


@pytest.mark.asyncio
async def test_partial_payment_does_not_close_case(client: AsyncClient, auth_headers: dict):
    """Partial payment leaves the case in 'invoiced' status."""
    await _setup_company(client, auth_headers)
    ctx = await _issue_invoice(client, auth_headers, "EC-011-ZZ")
    inv_id = ctx["id"]
    case_id = ctx["serviceCaseId"]
    total_ttc = ctx["totalTtc"]

    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": total_ttc / 2, "paymentMethod": "cash"},
    )

    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "invoiced"


@pytest.mark.asyncio
async def test_auto_close_case_audit_event(client: AsyncClient, auth_headers: dict):
    """Auto-close transition writes a serviceCase.statusChanged audit event."""
    await _setup_company(client, auth_headers)
    ctx = await _issue_invoice(client, auth_headers, "EC-012-ZZ")
    inv_id = ctx["id"]
    case_id = ctx["serviceCaseId"]
    total_ttc = ctx["totalTtc"]

    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": total_ttc, "paymentMethod": "wireTransfer"},
    )

    r = await client.get(
        "/api/v1/auditEvents", headers=auth_headers,
        params={"entityType": "serviceCase", "entityId": case_id},
    )
    events = r.json()
    closed_events = [
        e for e in events
        if e["eventType"] == "serviceCase.statusChanged"
        and e["payload"].get("toStatus") == "closed"
    ]
    assert len(closed_events) >= 1, f"Expected closed transition in audit events: {events}"
