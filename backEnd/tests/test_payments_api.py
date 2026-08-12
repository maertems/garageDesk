"""API integration tests for payments endpoints (Lot H)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _setup_complete_company(client: AsyncClient, headers: dict):
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


async def _create_invoice(client: AsyncClient, headers: dict, plate: str) -> dict:
    """Create a workCompleted case with a signed OR (60 HT / 72 TTC) and issue invoice."""
    rc = await client.post(
        "/api/v1/clients",
        headers=headers,
        json={"firstName": "Pay", "lastName": "Test", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles",
        headers=headers,
        json={"clientId": rc.json()["id"], "licensePlate": plate},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    rd = await client.post(
        "/api/v1/documents",
        headers=headers,
        json={"serviceCaseId": case_id, "documentType": "repairOrder"},
    )
    doc_id = rd.json()["id"]
    await client.put(
        f"/api/v1/documents/{doc_id}/lines",
        headers=headers,
        json={
            "lines": [{
                "sortOrder": 0, "lineType": "service", "label": "MO",
                "quantity": 1, "unitCode": "HUR", "unitPriceHt": 60.00,
                "discountPercent": 0, "vatRate": 20.00, "facturXVatCategory": "S",
            }]
        },
    )
    await client.patch(f"/api/v1/documents/{doc_id}", headers=headers, json={"status": "issued"})
    await client.post(
        "/api/v1/signatures",
        headers=headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "Pay Test", "method": "tabletSignature"},
    )
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "inProgress"})
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=headers, json={"status": "workCompleted"})

    ri = await client.post("/api/v1/invoices", headers=headers, json={"serviceCaseId": case_id})
    return ri.json()


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_payment_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/payments", json={"invoiceId": 1, "amount": 10, "paymentMethod": "cash"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_payment_partial(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-001-ZZ")
    inv_id = inv["id"]

    r = await client.post(
        "/api/v1/payments",
        headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 30.00, "paymentMethod": "cash"},
    )
    assert r.status_code == 201
    p = r.json()
    assert p["amount"] == pytest.approx(30.00)
    assert p["paymentMethod"] == "cash"
    assert not p["isCancelled"]

    # Invoice should now be partiallyPaid
    ri = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert ri.json()["paymentStatus"] == "partiallyPaid"
    assert ri.json()["amountPaid"] == pytest.approx(30.00)


@pytest.mark.asyncio
async def test_create_payment_full(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-002-ZZ")
    inv_id = inv["id"]

    # Full TTC = 72.00
    r = await client.post(
        "/api/v1/payments",
        headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 72.00, "paymentMethod": "card"},
    )
    assert r.status_code == 201

    ri = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert ri.json()["paymentStatus"] == "paid"
    assert ri.json()["amountPaid"] == pytest.approx(72.00)


@pytest.mark.asyncio
async def test_create_payment_invalid_method(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-003-ZZ")
    r = await client.post(
        "/api/v1/payments",
        headers=auth_headers,
        json={"invoiceId": inv["id"], "amount": 10.00, "paymentMethod": "bitcoin"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidPaymentMethod"


@pytest.mark.asyncio
async def test_create_payment_zero_amount(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-004-ZZ")
    r = await client.post(
        "/api/v1/payments",
        headers=auth_headers,
        json={"invoiceId": inv["id"], "amount": 0, "paymentMethod": "cash"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidAmount"


@pytest.mark.asyncio
async def test_list_payments_for_invoice(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-005-ZZ")
    inv_id = inv["id"]

    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 20.00, "paymentMethod": "cash"},
    )
    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 15.00, "paymentMethod": "card"},
    )

    r = await client.get(f"/api/v1/payments?invoiceId={inv_id}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.asyncio
async def test_cancel_payment_recalculates(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-006-ZZ")
    inv_id = inv["id"]

    rp = await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 72.00, "paymentMethod": "card"},
    )
    payment_id = rp.json()["id"]

    # Cancel it
    rc = await client.patch(
        f"/api/v1/payments/{payment_id}/cancel",
        headers=auth_headers,
        json={"cancellationReason": "erreur de caisse"},
    )
    assert rc.status_code == 200
    assert rc.json()["isCancelled"]
    assert rc.json()["cancellationReason"] == "erreur de caisse"

    # Invoice should revert to unpaid
    ri = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert ri.json()["paymentStatus"] == "unpaid"
    assert ri.json()["amountPaid"] == pytest.approx(0.00)


@pytest.mark.asyncio
async def test_cancel_already_cancelled(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-007-ZZ")
    rp = await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv["id"], "amount": 10.00, "paymentMethod": "cash"},
    )
    payment_id = rp.json()["id"]
    await client.patch(f"/api/v1/payments/{payment_id}/cancel", headers=auth_headers, json={})

    r = await client.patch(f"/api/v1/payments/{payment_id}/cancel", headers=auth_headers, json={})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "alreadyCancelled"


@pytest.mark.asyncio
async def test_two_partial_payments_sum_to_paid(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    inv = await _create_invoice(client, auth_headers, "PY-008-ZZ")
    inv_id = inv["id"]

    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 50.00, "paymentMethod": "cash"},
    )
    await client.post(
        "/api/v1/payments", headers=auth_headers,
        json={"invoiceId": inv_id, "amount": 22.00, "paymentMethod": "card"},
    )

    ri = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert ri.json()["paymentStatus"] == "paid"
    assert ri.json()["amountPaid"] == pytest.approx(72.00)
