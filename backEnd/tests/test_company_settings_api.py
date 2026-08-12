"""API integration tests for companySettings endpoints (Lot B)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_company_settings_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/companySettings")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_company_settings_returns_row(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/companySettings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == 1
    assert "missingMandatoryFields" in data
    assert isinstance(data["missingMandatoryFields"], list)
    # Seeded row is empty → should report multiple missing fields
    assert len(data["missingMandatoryFields"]) > 0


@pytest.mark.asyncio
async def test_patch_company_settings_requires_admin(client: AsyncClient, auth_headers: dict):
    r = await client.patch(
        "/api/v1/companySettings",
        headers=auth_headers,
        json={"name": "Garage Test"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_company_settings(client: AsyncClient, admin_headers: dict):
    r = await client.patch(
        "/api/v1/companySettings",
        headers=admin_headers,
        json={
            "name": "Garage Dupont SAS",
            "siren": "123456789",
            "siretHeadquarters": "12345678900012",
            "rcsCity": "Paris",
            "addressLine1": "1 rue de la Paix",
            "postalCode": "75001",
            "city": "Paris",
            "vatIntracom": "FR12345678901",
            "mediatorName": "Médiateur Auto",
            "mediatorUrl": "https://mediateur.example.fr",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Garage Dupont SAS"
    assert data["siren"] == "123456789"
    assert data["siretHeadquarters"] == "12345678900012"


@pytest.mark.asyncio
async def test_company_settings_complete_when_all_fields_set(client: AsyncClient, admin_headers: dict):
    r = await client.patch(
        "/api/v1/companySettings",
        headers=admin_headers,
        json={
            "name": "Garage Dupont SAS",
            "siren": "123456789",
            "siretHeadquarters": "12345678900012",
            "rcsCity": "Paris",
            "addressLine1": "1 rue de la Paix",
            "postalCode": "75001",
            "city": "Paris",
            "vatIntracom": "FR12345678901",
            "mediatorName": "Médiateur Auto",
            "mediatorUrl": "https://mediateur.example.fr",
        },
    )
    assert r.status_code == 200
    assert r.json()["missingMandatoryFields"] == []


@pytest.mark.asyncio
async def test_vat_exemption_removes_vatintracom_requirement(client: AsyncClient, admin_headers: dict):
    # With vatExemption=True, vatIntracom is not required
    r = await client.patch(
        "/api/v1/companySettings",
        headers=admin_headers,
        json={
            "name": "Artisan Auto",
            "siren": "987654321",
            "siretHeadquarters": "98765432100001",
            "rcsCity": "Lyon",
            "addressLine1": "5 avenue des Brotteaux",
            "postalCode": "69006",
            "city": "Lyon",
            "vatIntracom": None,
            "vatExemption": True,
            "mediatorName": "Médiateur Auto",
            "mediatorUrl": "https://mediateur.example.fr",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "vatIntracom" not in data["missingMandatoryFields"]


@pytest.mark.asyncio
async def test_patch_empty_body_returns_current(client: AsyncClient, admin_headers: dict):
    r = await client.patch("/api/v1/companySettings", headers=admin_headers, json={})
    assert r.status_code == 200
    assert "id" in r.json()
