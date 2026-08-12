from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user, get_current_admin
from app.schemas.leave_request import (
    LeaveRequestCreate,
    LeaveRequestUpdate,
    LeaveRequestResponse,
    LeaveRequestWithEmployeeResponse,
)

router = APIRouter(prefix="/leaveRequests", tags=["leaveRequests"])


@router.get("", response_model=list[LeaveRequestWithEmployeeResponse])
def list_leave_requests(
    current_user: dict = Depends(get_current_user),
    employee_id: int | None = Query(None, alias="employeeId"),
    month: int | None = Query(None, description="Filter by month (1-12)"),
    year: int | None = Query(None, description="Filter by year"),
    status: str | None = Query(None),
):
    with db_cursor() as cur:
        conditions = []
        params = []
        if employee_id is not None:
            conditions.append("lr.employeeId = %s")
            params.append(employee_id)
        if month is not None and year is not None:
            conditions.append("(MONTH(lr.startDate) = %s AND YEAR(lr.startDate) = %s) OR (MONTH(lr.endDate) = %s AND YEAR(lr.endDate) = %s)")
            params.extend([month, year, month, year])
        if status:
            conditions.append("lr.status = %s")
            params.append(status)
        where = " AND ".join(conditions) if conditions else "1=1"
        cur.execute(
            f"""
            SELECT lr.id, lr.employeeId, lr.startDate, lr.endDate, lr.status,
                   e.firstName AS employeeFirstName, e.lastName AS employeeLastName
            FROM leaveRequests lr
            JOIN employees e ON e.id = lr.employeeId
            WHERE {where}
            ORDER BY lr.startDate DESC
            """,
            params,
        )
        rows = cur.fetchall()
    return [LeaveRequestWithEmployeeResponse(**r) for r in rows]


@router.get("/{request_id}", response_model=LeaveRequestWithEmployeeResponse)
def get_leave_request(request_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT lr.id, lr.employeeId, lr.startDate, lr.endDate, lr.status,
                   e.firstName AS employeeFirstName, e.lastName AS employeeLastName
            FROM leaveRequests lr
            JOIN employees e ON e.id = lr.employeeId
            WHERE lr.id = %s
            """,
            (request_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Leave request not found"})
    return LeaveRequestWithEmployeeResponse(**row)


@router.post("", response_model=LeaveRequestResponse, status_code=201)
def create_leave_request(data: LeaveRequestCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO leaveRequests (employeeId, startDate, endDate, status) VALUES (%s, %s, %s, 'pending')",
            (data.employeeId, data.startDate, data.endDate),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        rid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, employeeId, startDate, endDate, status FROM leaveRequests WHERE id = %s",
            (rid,),
        )
        row = cur.fetchone()
    return LeaveRequestResponse(**row)


@router.patch("/{request_id}", response_model=LeaveRequestResponse)
def update_leave_request(
    request_id: int, data: LeaveRequestUpdate, current_user: dict = Depends(get_current_user)
):
    # Only admin can change status; employee can change dates on pending
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        with db_cursor() as cur:
            cur.execute(
                "SELECT id, employeeId, startDate, endDate, status FROM leaveRequests WHERE id = %s",
                (request_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Leave request not found"})
        return LeaveRequestResponse(**row)
    if "status" in updates and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Only admin can change status"})
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [request_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE leaveRequests SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Leave request not found"})
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, employeeId, startDate, endDate, status FROM leaveRequests WHERE id = %s",
            (request_id,),
        )
        row = cur.fetchone()
    return LeaveRequestResponse(**row)


@router.delete("/{request_id}", status_code=204)
def delete_leave_request(request_id: int, current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM leaveRequests WHERE id = %s", (request_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Leave request not found"})
