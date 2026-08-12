"""API integration tests for vatRates endpoints (Lot A)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_vat_rates_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/vatRates")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_vat_rates_returns_seeded(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/vatRates", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Seed inserts 4 French VAT rates
    codes = {row["code"] for row in data}
    assert {"vatStandard", "vatIntermediate", "vatReduced", "vatZero"}.issubset(codes)


@pytest.mark.asyncio
async def test_create_vat_rate_requires_admin(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/v1/vatRates",
        headers=auth_headers,
        json={"code": "testRate", "rate": 15.0, "label": "TVA test 15 %", "facturXCategory": "S"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_and_get_vat_rate(client: AsyncClient, admin_headers: dict):
    r = await client.post(
        "/api/v1/vatRates",
        headers=admin_headers,
        json={"code": "vatTest15", "rate": 15.0, "label": "TVA test 15 %", "facturXCategory": "S",
              "validFrom": "2025-01-01"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["code"] == "vatTest15"
    assert float(data["rate"]) == 15.0
    vat_id = data["id"]

    r2 = await client.get(f"/api/v1/vatRates/{vat_id}", headers=admin_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == vat_id
    assert r2.json()["validFrom"] is not None


@pytest.mark.asyncio
async def test_update_vat_rate(client: AsyncClient, admin_headers: dict):
    r = await client.post(
        "/api/v1/vatRates",
        headers=admin_headers,
        json={"code": "vatToUpdate", "rate": 8.0, "label": "Avant maj", "facturXCategory": "S"},
    )
    assert r.status_code == 201
    vat_id = r.json()["id"]

    r2 = await client.patch(
        f"/api/v1/vatRates/{vat_id}",
        headers=admin_headers,
        json={"label": "Après maj", "validUntil": "2029-12-31"},
    )
    assert r2.status_code == 200
    assert r2.json()["label"] == "Après maj"
    assert r2.json()["validUntil"] is not None


@pytest.mark.asyncio
async def test_create_vat_rate_duplicate_code(client: AsyncClient, admin_headers: dict):
    await client.post(
        "/api/v1/vatRates",
        headers=admin_headers,
        json={"code": "vatDupCheck", "rate": 3.0, "label": "Dup test", "facturXCategory": "Z"},
    )
    r = await client.post(
        "/api/v1/vatRates",
        headers=admin_headers,
        json={"code": "vatDupCheck", "rate": 3.0, "label": "Dup test 2", "facturXCategory": "Z"},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "duplicate"


@pytest.mark.asyncio
async def test_get_vat_rate_not_found(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/vatRates/999999", headers=auth_headers)
    assert r.status_code == 404
