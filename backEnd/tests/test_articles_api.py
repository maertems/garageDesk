"""API integration tests for articles endpoints (Lot A)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_articles_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/articles")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_articles_returns_seeded(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/articles", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    refs = {row["reference"] for row in data}
    assert {"LABOR-MECH", "LABOR-BODY", "DIAG-FEE"}.issubset(refs)


@pytest.mark.asyncio
async def test_list_articles_active_only(client: AsyncClient, admin_headers: dict, auth_headers: dict):
    # Create an inactive article
    r = await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={"reference": "INACTIVE-TEST", "label": "Article inactif", "unitCode": "unit", "price": 0, "isActive": False},
    )
    assert r.status_code == 201

    r2 = await client.get("/api/v1/articles?activeOnly=true", headers=auth_headers)
    assert r2.status_code == 200
    for row in r2.json():
        assert row["isActive"] is True


@pytest.mark.asyncio
async def test_list_articles_search(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/articles?search=LABOR", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 2
    for row in data:
        found = (
            "LABOR" in (row.get("reference") or "").upper()
            or "LABOR" in (row.get("label") or "").upper()
            or "LABOR" in (row.get("type") or "").upper()
        )
        assert found


@pytest.mark.asyncio
async def test_create_article_requires_admin(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/v1/articles",
        headers=auth_headers,
        json={"label": "Test", "unitCode": "unit", "price": 10.0},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_and_get_article(client: AsyncClient, admin_headers: dict, auth_headers: dict):
    r = await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={
            "reference": "TEST-ART-01",
            "type": "parts",
            "label": "Plaquettes de frein",
            "unitCode": "unit",
            "price": 45.50,
            "isActive": True,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["reference"] == "TEST-ART-01"
    assert float(data["price"]) == 45.5
    article_id = data["id"]

    r2 = await client.get(f"/api/v1/articles/{article_id}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == article_id


@pytest.mark.asyncio
async def test_update_article_toggle_active(client: AsyncClient, admin_headers: dict):
    r = await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={"reference": "TO-DEACTIVATE", "label": "A désactiver", "unitCode": "unit", "price": 20.0},
    )
    assert r.status_code == 201
    article_id = r.json()["id"]

    r2 = await client.patch(
        f"/api/v1/articles/{article_id}",
        headers=admin_headers,
        json={"isActive": False},
    )
    assert r2.status_code == 200
    assert r2.json()["isActive"] is False

    # Reactivate
    r3 = await client.patch(f"/api/v1/articles/{article_id}", headers=admin_headers, json={"isActive": True})
    assert r3.status_code == 200
    assert r3.json()["isActive"] is True


@pytest.mark.asyncio
async def test_create_article_invalid_vat_rate(client: AsyncClient, admin_headers: dict):
    r = await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={"label": "Article TVA invalide", "unitCode": "unit", "price": 10.0, "vatRateId": 999999},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalidReference"


@pytest.mark.asyncio
async def test_create_article_duplicate_reference(client: AsyncClient, admin_headers: dict):
    await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={"reference": "DUP-REF", "label": "Original", "unitCode": "unit", "price": 5.0},
    )
    r = await client.post(
        "/api/v1/articles",
        headers=admin_headers,
        json={"reference": "DUP-REF", "label": "Doublon", "unitCode": "unit", "price": 5.0},
    )
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "duplicate"


@pytest.mark.asyncio
async def test_get_article_not_found(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/articles/999999", headers=auth_headers)
    assert r.status_code == 404
