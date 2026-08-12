"""API integration tests for clients and vehicles."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_clients_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/clients")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_clients_empty_or_seeded(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/clients", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_create_and_get_client(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/v1/clients",
        headers=auth_headers,
        json={
            "firstName": "Jean",
            "lastName": "Dupont",
            "phone": "0612345678",
            "clientType": "individual",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["firstName"] == "Jean"
    assert data["lastName"] == "Dupont"
    client_id = data["id"]
    r2 = await client.get(f"/api/v1/clients/{client_id}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == client_id


@pytest.mark.asyncio
async def test_list_clients_with_vehicles(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/clients?withVehicles=true", headers=auth_headers)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    for item in lst:
        assert "vehicles" in item
        assert isinstance(item["vehicles"], list)
