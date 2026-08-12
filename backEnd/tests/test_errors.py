"""Unit tests for error response format (no DB required)."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_validation_error_returns_code_and_message():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/api/v1/auth/login",
            json={"login": "x"},  # missing required "password"
        )
    assert r.status_code == 422
    data = r.json()
    assert "code" in data
    assert "message" in data
    assert data["code"] == "validationError"


@pytest.mark.asyncio
async def test_health_no_auth_required():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
