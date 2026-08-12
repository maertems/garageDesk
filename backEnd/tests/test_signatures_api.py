"""API integration tests for signatures endpoints (Lot E)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _make_issued_doc(client: AsyncClient, headers: dict, doc_type: str = "quote") -> dict:
    """Create a client, vehicle, case, document of given type, issue it."""
    rc = await client.post(
        "/api/v1/clients",
        headers=headers,
        json={"firstName": "Sig", "lastName": "Test", "clientType": "individual"},
    )
    client_id = rc.json()["id"]
    rv = await client.post(
        "/api/v1/vehicles",
        headers=headers,
        json={"clientId": client_id, "licensePlate": "SG-001-ZZ"},
    )
    vehicle_id = rv.json()["id"]
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = rs.json()["id"]

    # For amendments, we need a quote first
    parent_id = None
    if doc_type == "quoteAmendment":
        rq = await client.post(
            "/api/v1/documents",
            headers=headers,
            json={"serviceCaseId": case_id, "documentType": "quote"},
        )
        parent_id = rq.json()["id"]

    create_body: dict = {"serviceCaseId": case_id, "documentType": doc_type}
    if parent_id:
        create_body["parentDocumentId"] = parent_id

    rd = await client.post("/api/v1/documents", headers=headers, json=create_body)
    doc_id = rd.json()["id"]

    # Issue the document
    ri = await client.patch(
        f"/api/v1/documents/{doc_id}",
        headers=headers,
        json={"status": "issued"},
    )
    assert ri.status_code == 200
    return ri.json()


_BASE_SIG = {
    "signerType": "client",
    "signerName": "Jean Dupont",
    "method": "tabletSignature",
}


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sign_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/signatures", json={**_BASE_SIG, "documentId": 1})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_sign_document(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "quote")
    r = await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    assert r.status_code == 201
    sig = r.json()
    assert sig["documentId"] == doc["id"]
    assert sig["method"] == "tabletSignature"
    assert sig["signerName"] == "Jean Dupont"
    assert sig["signedAt"] is not None


@pytest.mark.asyncio
async def test_sign_sets_document_signed(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "quote")
    await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    r = await client.get(f"/api/v1/documents/{doc['id']}", headers=auth_headers)
    assert r.json()["status"] == "signed"
    assert r.json()["signatureId"] is not None


@pytest.mark.asyncio
async def test_sign_repairOrder_transitions_case_to_diagnosing(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "repairOrder")
    case_id = doc["serviceCaseId"]

    # Case must be 'open' before signing
    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "open"

    await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    rc2 = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc2.json()["status"] == "diagnosing"


@pytest.mark.asyncio
async def test_sign_quote_transitions_case_to_inprogress(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "quote")
    case_id = doc["serviceCaseId"]

    # After issuing the quote, case should be quoteIssued
    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "quoteIssued"

    await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    rc2 = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc2.json()["status"] == "inProgress"


@pytest.mark.asyncio
async def test_sign_amendment_transitions_case_to_inprogress(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "quoteAmendment")
    case_id = doc["serviceCaseId"]

    # Manually set case to awaitingAmendmentSignature
    await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=auth_headers,
        json={"status": "awaitingAmendmentSignature"},
    )

    await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    rc = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc.json()["status"] == "inProgress"


@pytest.mark.asyncio
async def test_cannot_sign_draft_document(client: AsyncClient, auth_headers: dict):
    rc = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={"firstName": "X", "lastName": "Y", "clientType": "individual"},
    )
    client_id = rc.json()["id"]
    rv = await client.post(
        "/api/v1/vehicles",
        headers=auth_headers,
        json={"clientId": client_id, "licensePlate": "ND-001-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": rv.json()["id"]},
    )
    rd = await client.post(
        "/api/v1/documents",
        headers=auth_headers,
        json={"serviceCaseId": rs.json()["id"], "documentType": "quote"},
    )
    r = await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": rd.json()["id"]},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "notIssued"


@pytest.mark.asyncio
async def test_list_signatures_for_document(client: AsyncClient, auth_headers: dict):
    doc = await _make_issued_doc(client, auth_headers, "quote")
    await client.post(
        "/api/v1/signatures",
        headers=auth_headers,
        json={**_BASE_SIG, "documentId": doc["id"]},
    )
    r = await client.get(f"/api/v1/signatures?documentId={doc['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.asyncio
async def test_quote_issued_auto_transitions_case_to_quoteissued(client: AsyncClient, auth_headers: dict):
    """When a quote is issued, case transitions open → quoteIssued automatically."""
    rc = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={"firstName": "Auto", "lastName": "Trans", "clientType": "individual"},
    )
    client_id = rc.json()["id"]
    rv = await client.post(
        "/api/v1/vehicles",
        headers=auth_headers,
        json={"clientId": client_id, "licensePlate": "AT-001-ZZ"},
    )
    rs = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": rv.json()["id"]},
    )
    case_id = rs.json()["id"]

    rd = await client.post(
        "/api/v1/documents",
        headers=auth_headers,
        json={"serviceCaseId": case_id, "documentType": "quote"},
    )
    # Issue the quote
    await client.patch(
        f"/api/v1/documents/{rd.json()['id']}",
        headers=auth_headers,
        json={"status": "issued"},
    )
    rc2 = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert rc2.json()["status"] == "quoteIssued"
