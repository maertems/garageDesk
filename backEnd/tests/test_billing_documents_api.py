"""API integration tests for billing documents endpoints (Lot D)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _make_case(client: AsyncClient, headers: dict) -> int:
    rc = await client.post(
        "/api/v1/clients",
        headers=headers,
        json={"firstName": "Test", "lastName": "Billdoc", "clientType": "individual"},
    )
    client_id = rc.json()["id"]
    rv = await client.post(
        "/api/v1/vehicles",
        headers=headers,
        json={"clientId": client_id, "licensePlate": "BD-001-ZZ"},
    )
    vehicle_id = rv.json()["id"]
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    return rs.json()["id"]


async def _make_doc(client: AsyncClient, headers: dict, case_id: int, doc_type="quote") -> dict:
    r = await client.post(
        "/api/v1/documents",
        headers=headers,
        json={"serviceCaseId": case_id, "documentType": doc_type},
    )
    assert r.status_code == 201
    return r.json()


_SAMPLE_LINES = [
    {"label": "Main d'oeuvre", "quantity": 2, "unitPriceHt": 75.0, "discountPercent": 0, "vatRate": 20, "facturXVatCategory": "S"},
    {"label": "Pièce X", "quantity": 1, "unitPriceHt": 45.0, "discountPercent": 10, "vatRate": 20, "facturXVatCategory": "S"},
]


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_documents_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/documents?serviceCaseId=1")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_create_document(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id, "quote")
    assert doc["documentType"] == "quote"
    assert doc["status"] == "draft"
    assert doc["documentNumber"].startswith("DV-")
    assert doc["lines"] == []
    assert doc["totalTtc"] == 0.0


@pytest.mark.asyncio
async def test_document_numbering_per_type(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    or_doc = await _make_doc(client, auth_headers, case_id, "repairOrder")
    ct_doc = await _make_doc(client, auth_headers, case_id, "counterSale")
    assert or_doc["documentNumber"].startswith("OR-")
    assert ct_doc["documentNumber"].startswith("VD-")


@pytest.mark.asyncio
async def test_amendment_requires_parent(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    r = await client.post(
        "/api/v1/documents",
        headers=auth_headers,
        json={"serviceCaseId": case_id, "documentType": "quoteAmendment"},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "missingParent"


@pytest.mark.asyncio
async def test_amendment_parent_must_be_quote(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    or_doc = await _make_doc(client, auth_headers, case_id, "repairOrder")
    r = await client.post(
        "/api/v1/documents",
        headers=auth_headers,
        json={"serviceCaseId": case_id, "documentType": "quoteAmendment", "parentDocumentId": or_doc["id"]},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidParentType"


@pytest.mark.asyncio
async def test_amendment_parent_same_case(client: AsyncClient, auth_headers: dict):
    case_a = await _make_case(client, auth_headers)
    case_b = await _make_case(client, auth_headers)
    quote_a = await _make_doc(client, auth_headers, case_a, "quote")
    r = await client.post(
        "/api/v1/documents",
        headers=auth_headers,
        json={"serviceCaseId": case_b, "documentType": "quoteAmendment", "parentDocumentId": quote_a["id"]},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "parentCaseMismatch"


@pytest.mark.asyncio
async def test_replace_lines_and_totals(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)

    r = await client.put(
        f"/api/v1/documents/{doc['id']}/lines",
        headers=auth_headers,
        json={"lines": _SAMPLE_LINES, "globalDiscountPercent": 0},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["lines"]) == 2
    # Line 1: 2 × 75 = 150 HT, TVA 20% = 30, TTC 180
    l1 = next(l for l in data["lines"] if "oeuvre" in l["label"])
    assert float(l1["totalHt"]) == 150.0
    assert float(l1["totalTtc"]) == 180.0
    # Line 2: 1 × 45 − 10% = 40.50 HT, TVA 20% = 8.10
    l2 = next(l for l in data["lines"] if "Pièce" in l["label"])
    assert float(l2["totalHt"]) == 40.5
    # Document totals: subtotal = 190.50, totalVat ≈ 38.10, totalTtc ≈ 228.60
    assert float(data["subtotalHt"]) == 190.5
    assert float(data["totalTtc"]) == pytest.approx(228.6, abs=0.01)


@pytest.mark.asyncio
async def test_global_discount_recomputes_totals(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    await client.put(
        f"/api/v1/documents/{doc['id']}/lines",
        headers=auth_headers,
        json={"lines": _SAMPLE_LINES, "globalDiscountPercent": 10},
    )
    r = await client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    data = r.json()
    assert float(data["globalDiscountPercent"]) == 10.0
    # subtotal 190.50 × (1−0.10) = 171.45
    assert float(data["totalHt"]) == pytest.approx(171.45, abs=0.01)


@pytest.mark.asyncio
async def test_cannot_edit_lines_on_issued_document(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    # Issue it
    await client.patch(
        f"/api/v1/documents/{doc['id']}",
        headers=auth_headers,
        json={"status": "issued"},
    )
    r = await client.put(
        f"/api/v1/documents/{doc['id']}/lines",
        headers=auth_headers,
        json={"lines": _SAMPLE_LINES},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "immutable"


@pytest.mark.asyncio
async def test_valid_status_transition(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    r = await client.patch(
        f"/api/v1/documents/{doc['id']}",
        headers=auth_headers,
        json={"status": "issued"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "issued"


@pytest.mark.asyncio
async def test_invalid_status_transition(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    r = await client.patch(
        f"/api/v1/documents/{doc['id']}",
        headers=auth_headers,
        json={"status": "signed"},  # draft → signed is not allowed
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidTransition"


@pytest.mark.asyncio
async def test_delete_draft_document(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    r = await client.delete(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    assert r.status_code == 204
    r2 = await client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    assert r2.status_code == 404


@pytest.mark.asyncio
async def test_cannot_delete_issued_document(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    doc = await _make_doc(client, auth_headers, case_id)
    await client.patch(
        f"/api/v1/documents/{doc['id']}",
        headers=auth_headers,
        json={"status": "issued"},
    )
    r = await client.delete(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "immutable"


@pytest.mark.asyncio
async def test_list_documents_for_case(client: AsyncClient, auth_headers: dict):
    case_id = await _make_case(client, auth_headers)
    await _make_doc(client, auth_headers, case_id, "repairOrder")
    await _make_doc(client, auth_headers, case_id, "quote")
    r = await client.get(f"/api/v1/documents?serviceCaseId={case_id}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 2
