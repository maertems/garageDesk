"""API integration tests for audit events endpoint (Lot J)."""

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


async def _issue_invoice(client: AsyncClient, headers: dict, plate: str) -> dict:
    """Return the issued invoice dict for a workCompleted case."""
    rc = await client.post(
        "/api/v1/clients", headers=headers,
        json={"firstName": "Audit", "lastName": "Test", "clientType": "individual"},
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
                         "quantity": 1, "unitCode": "HUR", "unitPriceHt": 50.00,
                         "discountPercent": 0, "vatRate": 20.00, "facturXVatCategory": "S"}]},
    )
    await client.patch(f"/api/v1/documents/{doc_id}", headers=headers, json={"status": "issued"})
    await client.post(
        "/api/v1/signatures", headers=headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "Test Client",
              "signerEmail": "c@test.fr", "method": "emailApproval"},
    )
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "workCompleted"})

    ri = await client.post(
        "/api/v1/invoices", headers=headers,
        json={"serviceCaseId": case_id},
    )
    assert ri.status_code == 201, ri.text
    return ri.json()


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_events_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/auditEvents")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_audit_events_list_empty_ok(client: AsyncClient, auth_headers: dict):
    """GET without filters returns 200 list (may have rows from other tests)."""
    r = await client.get("/api/v1/auditEvents", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_invoice_issued_creates_audit_event(client: AsyncClient, auth_headers: dict):
    """Issuing an invoice writes an invoice.issued event."""
    await _setup_company(client, auth_headers)
    inv = await _issue_invoice(client, auth_headers, "AU-001-ZZ")

    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"entityType": "invoice", "entityId": inv["id"]},
    )
    assert r.status_code == 200
    events = r.json()
    assert any(e["eventType"] == "invoice.issued" for e in events), f"Expected invoice.issued in {events}"

    issued = next(e for e in events if e["eventType"] == "invoice.issued")
    assert issued["entityId"] == inv["id"]
    assert issued["payload"]["invoiceNumber"] == inv["invoiceNumber"]


@pytest.mark.asyncio
async def test_invoice_issued_triggers_case_audit_event(client: AsyncClient, auth_headers: dict):
    """Issuing an invoice also writes a serviceCase.statusChanged event."""
    await _setup_company(client, auth_headers)
    inv = await _issue_invoice(client, auth_headers, "AU-002-ZZ")

    # Find serviceCaseId from invoice
    ri = await client.get(f"/api/v1/invoices/{inv['id']}", headers=auth_headers)
    case_id = ri.json()["serviceCaseId"]

    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"entityType": "serviceCase", "entityId": case_id},
    )
    assert r.status_code == 200
    events = r.json()
    status_events = [e for e in events if e["eventType"] == "serviceCase.statusChanged"]
    assert any(
        e["payload"]["toStatus"] == "invoiced" for e in status_events
    ), f"Expected invoiced transition in {status_events}"


@pytest.mark.asyncio
async def test_signature_creates_audit_event(client: AsyncClient, auth_headers: dict):
    """Signing a document creates a document.signed audit event."""
    rc = await client.post(
        "/api/v1/clients", headers=auth_headers,
        json={"firstName": "Sig", "lastName": "Audit", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles", headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "AU-003-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases", headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    rd = await client.post(
        "/api/v1/documents", headers=auth_headers,
        json={"serviceCaseId": case_id, "documentType": "repairOrder"},
    )
    doc_id = rd.json()["id"]
    await client.patch(f"/api/v1/documents/{doc_id}", headers=auth_headers, json={"status": "issued"})

    rsig = await client.post(
        "/api/v1/signatures", headers=auth_headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "Sig Test",
              "signerEmail": "sig@test.fr", "method": "tabletSignature"},
    )
    assert rsig.status_code == 201

    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"entityType": "document", "entityId": doc_id},
    )
    assert r.status_code == 200
    events = r.json()
    assert any(e["eventType"] == "document.signed" for e in events)


@pytest.mark.asyncio
async def test_payment_creates_audit_event(client: AsyncClient, auth_headers: dict):
    """Recording a payment creates a payment.created audit event."""
    await _setup_company(client, auth_headers)
    inv = await _issue_invoice(client, auth_headers, "AU-004-ZZ")

    rp = await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv["id"], "amount": 30.00, "paymentMethod": "card"},
    )
    assert rp.status_code == 201
    payment_id = rp.json()["id"]

    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"entityType": "payment", "entityId": payment_id},
    )
    assert r.status_code == 200
    events = r.json()
    assert any(e["eventType"] == "payment.created" for e in events)
    created = next(e for e in events if e["eventType"] == "payment.created")
    assert created["payload"]["invoiceId"] == inv["id"]


@pytest.mark.asyncio
async def test_filter_by_event_type(client: AsyncClient, auth_headers: dict):
    """Filtering by eventType=invoice.issued returns only invoice.issued events."""
    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"eventType": "invoice.issued"},
    )
    assert r.status_code == 200
    events = r.json()
    assert all(e["eventType"] == "invoice.issued" for e in events)


@pytest.mark.asyncio
async def test_payment_cancel_creates_audit_event(client: AsyncClient, auth_headers: dict):
    """Cancelling a payment creates a payment.cancelled audit event."""
    await _setup_company(client, auth_headers)
    inv = await _issue_invoice(client, auth_headers, "AU-005-ZZ")

    rp = await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv["id"], "amount": 20.00, "paymentMethod": "cash"},
    )
    payment_id = rp.json()["id"]

    rc = await client.patch(
        f"/api/v1/payments/{payment_id}/cancel", headers=auth_headers,
        json={"cancellationReason": "erreur"},
    )
    assert rc.status_code == 200

    r = await client.get(
        "/api/v1/auditEvents",
        headers=auth_headers,
        params={"entityType": "payment", "entityId": payment_id},
    )
    assert r.status_code == 200
    events = r.json()
    assert any(e["eventType"] == "payment.cancelled" for e in events)
    cancelled = next(e for e in events if e["eventType"] == "payment.cancelled")
    assert cancelled["payload"]["reason"] == "erreur"
