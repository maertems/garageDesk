"""API integration tests for appointments."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_appointment_categories(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/appointmentCategories", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_list_appointments_with_date_filter(client: AsyncClient, auth_headers: dict):
    r = await client.get(
        "/api/v1/appointments",
        headers=auth_headers,
        params={"start": "2025-02-10T00:00:00", "end": "2025-02-16T23:59:59"},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)
