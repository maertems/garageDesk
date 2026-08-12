"""API integration tests for authentication."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/login",
        json={"login": "garage", "password": "garage"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "user" in data
    assert data["user"]["login"] == "garage"
    assert data["user"]["role"] == "garage"
    assert data.get("sessionId") or data.get("session_id")


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/login",
        json={"login": "garage", "password": "wrong"},
    )
    assert r.status_code == 401
    body = r.json()
    assert "code" in body
    assert "message" in body


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_with_session(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["login"] == "garage"
    assert data["role"] == "garage"
