"""API integration tests for leave requests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_leave_requests(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/v1/leaveRequests", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_list_leave_requests_by_month(client: AsyncClient, auth_headers: dict):
    r = await client.get(
        "/api/v1/leaveRequests",
        headers=auth_headers,
        params={"month": 2, "year": 2025},
    )
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_create_leave_request(client: AsyncClient, auth_headers: dict):
    # Need an employee
    re = await client.get("/api/v1/employees", headers=auth_headers)
    assert re.status_code == 200
    employees = re.json()
    if not employees:
        # Create one
        re2 = await client.post(
            "/api/v1/employees",
            headers=auth_headers,
            json={"firstName": "Paul", "lastName": "Durand", "category": "mechanic"},
        )
        assert re2.status_code == 201
        employee_id = re2.json()["id"]
    else:
        employee_id = employees[0]["id"]
    r = await client.post(
        "/api/v1/leaveRequests",
        headers=auth_headers,
        json={
            "employeeId": employee_id,
            "startDate": "2025-03-01",
            "endDate": "2025-03-05",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    assert data["employeeId"] == employee_id
