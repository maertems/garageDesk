"""API integration tests for invoices endpoints (Lot F)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _setup_complete_company(client: AsyncClient, headers: dict):
    """Patch companySettings so all mandatory fields are present."""
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


async def _create_work_completed_case(client: AsyncClient, headers: dict, plate: str = "WC-001-ZZ") -> tuple[int, int]:
    """Create a case in workCompleted status with one signed OR document. Returns (case_id, doc_id)."""
    rc = await client.post(
        "/api/v1/clients",
        headers=headers,
        json={"firstName": "Jean", "lastName": "Facture", "clientType": "individual"},
    )
    client_id = rc.json()["id"]
    rv = await client.post(
        "/api/v1/vehicles",
        headers=headers,
        json={"clientId": client_id, "licensePlate": plate},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=headers,
        json={"clientId": client_id, "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    # Create and issue a repairOrder with one line
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
                "sortOrder": 0,
                "lineType": "service",
                "label": "Main d'œuvre vidange",
                "quantity": 1,
                "unitCode": "HUR",
                "unitPriceHt": 60.00,
                "discountPercent": 0,
                "vatRate": 20.00,
                "facturXVatCategory": "S",
            }]
        },
    )
    await client.patch(
        f"/api/v1/documents/{doc_id}",
        headers=headers,
        json={"status": "issued"},
    )
    # Sign the OR (case → diagnosing)
    await client.post(
        "/api/v1/signatures",
        headers=headers,
        json={"documentId": doc_id, "signerType": "client", "signerName": "Jean Facture", "method": "tabletSignature"},
    )
    # Manually advance case to workCompleted
    await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=headers,
        json={"status": "inProgress"},
    )
    await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=headers,
        json={"status": "workCompleted"},
    )
    return case_id, doc_id


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_issue_invoice_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/invoices", json={"serviceCaseId": 1})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_issue_invoice_missing_settings(client: AsyncClient, auth_headers: dict):
    """Returns 422 when companySettings mandatory fields are missing."""
    rc = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={"firstName": "X", "lastName": "Y", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles",
        headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "MS-001-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    # Manually push to workCompleted
    case_id = rs.json()["id"]
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=auth_headers, json={"status": "inProgress"})
    await client.patch(f"/api/v1/serviceCases/{case_id}", headers=auth_headers, json={"status": "workCompleted"})

    r = await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "incompleteMandatoryFields"


@pytest.mark.asyncio
async def test_issue_invoice_wrong_case_status(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    rc = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={"firstName": "A", "lastName": "B", "clientType": "individual"},
    )
    rv = await client.post(
        "/api/v1/vehicles",
        headers=auth_headers,
        json={"clientId": rc.json()["id"], "licensePlate": "WS-001-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": rc.json()["id"], "vehicleId": rv.json()["id"]},
    )
    r = await client.post(
        "/api/v1/invoices",
        headers=auth_headers,
        json={"serviceCaseId": rs.json()["id"]},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidCaseStatus"


@pytest.mark.asyncio
async def test_issue_invoice_success(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-001-ZZ")

    r = await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    assert r.status_code == 201
    inv = r.json()
    assert inv["serviceCaseId"] == case_id
    assert inv["invoiceNumber"].startswith("FA-")
    assert inv["paymentStatus"] == "unpaid"
    assert float(inv["totalHt"]) == pytest.approx(60.00)
    assert float(inv["totalTtc"]) == pytest.approx(72.00)
    assert len(inv["lines"]) == 1
    assert inv["lines"][0]["label"] == "Main d'œuvre vidange"


@pytest.mark.asyncio
async def test_issue_invoice_transitions_case_to_invoiced(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-002-ZZ")

    await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "invoiced"


@pytest.mark.asyncio
async def test_issue_invoice_idempotency_guard(client: AsyncClient, auth_headers: dict):
    """Double POST returns 409."""
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-003-ZZ")

    await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    r2 = await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    assert r2.status_code == 409
    assert r2.json()["detail"]["code"] == "alreadyInvoiced"


@pytest.mark.asyncio
async def test_get_invoice_by_id(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-004-ZZ")

    ri = await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    inv_id = ri.json()["id"]

    r = await client.get(f"/api/v1/invoices/{inv_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == inv_id
    assert r.json()["issuerName"] == "GarageDesk SAS"
    assert r.json()["issuerSiren"] == "123456789"


@pytest.mark.asyncio
async def test_list_invoices_by_case(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-005-ZZ")
    await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})

    r = await client.get(f"/api/v1/invoices?serviceCaseId={case_id}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1
    assert r.json()[0]["serviceCaseId"] == case_id


@pytest.mark.asyncio
async def test_invoice_snapshot_contains_client_name(client: AsyncClient, auth_headers: dict):
    await _setup_complete_company(client, auth_headers)
    case_id, _ = await _create_work_completed_case(client, auth_headers, "IV-006-ZZ")

    ri = await client.post("/api/v1/invoices", headers=auth_headers, json={"serviceCaseId": case_id})
    inv = ri.json()
    assert inv["clientName"] == "Facture"
    assert inv["clientFirstName"] == "Jean"
