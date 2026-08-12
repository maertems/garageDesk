"""
Pytest fixtures. Tests require a test MySQL database: set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
to a database where schema and seed (including users) have been applied.
"""
import os
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient):
    """Login as garage and return headers with X-Session-Id."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"login": "garage", "password": "garage"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    session_id = data.get("sessionId") or data.get("session_id")
    assert session_id
    return {"X-Session-Id": session_id}


@pytest.fixture
async def admin_headers(client: AsyncClient):
    """Login as admin and return headers with X-Session-Id."""
    r = await client.post(
        "/api/v1/auth/login",
        json={"login": "admin", "password": "admin"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    session_id = data.get("sessionId") or data.get("session_id")
    assert session_id
    return {"X-Session-Id": session_id}
