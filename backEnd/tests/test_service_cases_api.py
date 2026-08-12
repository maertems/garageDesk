"""API integration tests for serviceCases endpoints (Lot C)."""

import pytest
from httpx import AsyncClient


# ── helpers ──────────────────────────────────────────────────────────────────

async def _create_client(client: AsyncClient, auth_headers: dict) -> int:
    r = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={"firstName": "Alice", "lastName": "Lecas", "clientType": "individual"},
    )
    assert r.status_code == 201
    return r.json()["id"]


async def _create_vehicle(client: AsyncClient, auth_headers: dict, client_id: int) -> int:
    r = await client.post(
        "/api/v1/vehicles",
        headers=auth_headers,
        json={"clientId": client_id, "licensePlate": "AA-001-ZZ"},
    )
    assert r.status_code == 201
    return r.json()["id"]


# ── tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_service_cases_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/serviceCases")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_service_cases(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/serviceCases", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_create_service_case(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)

    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id, "kilometrage": 85000},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "open"
    assert data["clientId"] == client_id
    assert data["vehicleId"] == vehicle_id
    assert data["kilometrage"] == 85000
    assert data["caseNumber"].startswith("D-")
    # joined fields present
    assert data["clientLastName"] == "Lecas"
    assert data["vehicleLicensePlate"] == "AA-001-ZZ"


@pytest.mark.asyncio
async def test_case_number_increments(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)

    r1 = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    r2 = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    n1 = int(r1.json()["caseNumber"].split("-")[-1])
    n2 = int(r2.json()["caseNumber"].split("-")[-1])
    assert n2 == n1 + 1


@pytest.mark.asyncio
async def test_create_case_invalid_client(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": 999999, "vehicleId": 1},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidReference"


@pytest.mark.asyncio
async def test_create_case_vehicle_client_mismatch(client: AsyncClient, auth_headers: dict):
    client_a = await _create_client(client, auth_headers)
    client_b = await _create_client(client, auth_headers)
    vehicle_b = await _create_vehicle(client, auth_headers, client_b)

    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_a, "vehicleId": vehicle_b},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "vehicleClientMismatch"


@pytest.mark.asyncio
async def test_get_service_case(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = r.json()["id"]

    r2 = await client.get(f"/api/v1/serviceCases/{case_id}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == case_id


@pytest.mark.asyncio
async def test_update_service_case_notes(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = r.json()["id"]

    r2 = await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=auth_headers,
        json={"internalNotes": "Bruit au démarrage", "kilometrage": 91000},
    )
    assert r2.status_code == 200
    assert r2.json()["internalNotes"] == "Bruit au démarrage"
    assert r2.json()["kilometrage"] == 91000


@pytest.mark.asyncio
async def test_valid_status_transition(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = r.json()["id"]

    # open → diagnosing (valid)
    r2 = await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=auth_headers,
        json={"status": "diagnosing"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "diagnosing"


@pytest.mark.asyncio
async def test_invalid_status_transition(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = r.json()["id"]

    # open → invoiced (invalid, must go through intermediate states)
    r2 = await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=auth_headers,
        json={"status": "invoiced"},
    )
    assert r2.status_code == 422
    assert r2.json()["detail"]["code"] == "invalidTransition"


@pytest.mark.asyncio
async def test_cancel_sets_closed_at(client: AsyncClient, auth_headers: dict):
    client_id = await _create_client(client, auth_headers)
    vehicle_id = await _create_vehicle(client, auth_headers, client_id)
    r = await client.post(
        "/api/v1/serviceCases",
        headers=auth_headers,
        json={"clientId": client_id, "vehicleId": vehicle_id},
    )
    case_id = r.json()["id"]

    r2 = await client.patch(
        f"/api/v1/serviceCases/{case_id}",
        headers=auth_headers,
        json={"status": "cancelled"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancelled"
    assert r2.json()["closedAt"] is not None


@pytest.mark.asyncio
async def test_search_and_status_filter(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/serviceCases?status=open", headers=auth_headers)
    assert r.status_code == 200
    for row in r.json():
        assert row["status"] == "open"

    r2 = await client.get("/api/v1/serviceCases?search=D-", headers=auth_headers)
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)


@pytest.mark.asyncio
async def test_get_service_case_not_found(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/serviceCases/999999", headers=auth_headers)
    assert r.status_code == 404
