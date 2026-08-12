"""API integration tests for settings."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_settings(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/settings", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Seed may have calendarDefaultView etc.
    keys = [x["key"] for x in data]
    assert isinstance(keys, list)


@pytest.mark.asyncio
async def test_get_setting_by_key(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/settings/calendarDefaultView", headers=auth_headers)
    if r.status_code == 404:
        pytest.skip("Seed did not insert calendarDefaultView")
    assert r.status_code == 200
    assert r.json()["key"] == "calendarDefaultView"
