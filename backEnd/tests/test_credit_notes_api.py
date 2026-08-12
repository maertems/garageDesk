"""API integration tests for creditNotes endpoints (Lot I)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _setup_company(client: AsyncClient, headers: dict):
    await client.patch(
        "/api/v1/companySettings",
        headers=headers,
        json={
            "name": "GarageDesk SAS", "siren": "123456789",
            "siretHeadquarters": "12345678900012", "rcsCity": "Lille",
            "addressLine1": "1 rue des Acacias", "postalCode": "59000", "city": "Lille",
            "mediatorName": "Auto Médiation", "mediatorUrl": "https://mediation-auto.fr",
            "vatIntracom": "FR12123456789",
        },
    )


async def _create_invoice(client: AsyncClient, headers: dict, plate: str) -> dict:
    rc = await client.post("/api/v1/clients", headers=headers,
        json={"firstName": "CN", "lastName": "Test", "clientType": "individual"})
    rv = await client.post("/api/v1/vehicles", headers=headers,
        json={"clientId": rc.json()["id"], "licensePlate": plate})
    rs = await client.post("/api/v1/serviceCases", headers=headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]})
    case_id = rs.json()["id"]

    rd = await client.post("/api/v1/documents", headers=headers,
        json={"serviceCaseId": case_id, "documentType": "repairOrder"})
    doc_id = rd.json()["id"]
    await client.put(f"/api/v1/documents/{doc_id}/lines", headers=headers, json={
        "lines": [{"sortOrder": 0, "lineType": "service", "label": "MO vidange",
                   "quantity": 1, "unitCode": "HUR", "unitPriceHt": 80.00,
                   "discountPercent": 0, "vatRate": 20.00, "facturXVatCategory": "S"}]
    })
    await client.patch(f"/api/v1/documents/{doc_id}", headers=headers, json={"status": "issued"})
    await client.post("/api/v1/signatures", headers=headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "CN Test", "method": "tabletSignature"})
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "inProgress"})
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "workCompleted"})
    ri = await client.post("/api/v1/invoices", headers=headers, json={"serviceCaseId": case_id})
    return ri.json()


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_cn_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/creditNotes",
        json={"sourceInvoiceId": 1, "reason": "erreur", "refundMethod": "commercialCredit"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_full_credit_note(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-001-ZZ")

    r = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"],
        "reason": "Prestation non conforme",
        "refundMethod": "commercialCredit",
    })
    assert r.status_code == 201
    cn = r.json()
    assert cn["creditNoteNumber"].startswith("AV-")
    assert cn["sourceInvoiceId"] == inv["id"]
    assert cn["reason"] == "Prestation non conforme"
    assert cn["refundMethod"] == "commercialCredit"
    assert len(cn["lines"]) == 1
    assert cn["lines"][0]["label"] == "MO vidange"
    assert float(cn["totalTtc"]) == pytest.approx(96.00)


@pytest.mark.asyncio
async def test_create_cn_copies_snapshot_from_invoice(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-002-ZZ")

    r = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "Annulation", "refundMethod": "wireTransferRefund",
    })
    cn = r.json()
    assert cn["issuerName"] == inv["issuerName"]
    assert cn["clientName"] == inv["clientName"]
    assert cn["vehicleLicensePlate"] == inv["vehicleLicensePlate"]


@pytest.mark.asyncio
async def test_create_partial_credit_note(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-003-ZZ")

    r = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"],
        "reason": "Remboursement partiel pièces",
        "refundMethod": "cashRefund",
        "lines": [{
            "label": "Pièce remboursée", "quantity": 1, "unitPriceHt": 20.00,
            "discountPercent": 0, "vatRate": 20.00, "facturXVatCategory": "S",
        }],
    })
    assert r.status_code == 201
    cn = r.json()
    assert len(cn["lines"]) == 1
    assert float(cn["totalTtc"]) == pytest.approx(24.00)


@pytest.mark.asyncio
async def test_create_cn_invalid_refund_method(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-004-ZZ")
    r = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "X", "refundMethod": "bitcoin",
    })
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidRefundMethod"


@pytest.mark.asyncio
async def test_create_cn_unknown_invoice(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    r = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": 999999, "reason": "X", "refundMethod": "commercialCredit",
    })
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_credit_note_by_id(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-005-ZZ")
    rc = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "Test", "refundMethod": "commercialCredit",
    })
    cn_id = rc.json()["id"]

    r = await client.get(f"/api/v1/creditNotes/{cn_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == cn_id
    assert len(r.json()["lines"]) >= 1


@pytest.mark.asyncio
async def test_list_credit_notes_by_invoice(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-006-ZZ")
    await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "Test1", "refundMethod": "commercialCredit",
    })
    await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "Test2", "refundMethod": "cashRefund",
    })
    r = await client.get(f"/api/v1/creditNotes?sourceInvoiceId={inv['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_cn_pdf_returns_pdf_bytes(client: AsyncClient, auth_headers: dict):
    await _setup_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "CN-007-ZZ")
    rc = await client.post("/api/v1/creditNotes", headers=auth_headers, json={
        "sourceInvoiceId": inv["id"], "reason": "Test PDF", "refundMethod": "commercialCredit",
    })
    cn_id = rc.json()["id"]

    r = await client.get(f"/api/v1/creditNotes/{cn_id}/pdf", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF"
