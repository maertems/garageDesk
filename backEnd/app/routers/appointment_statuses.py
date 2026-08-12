from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.appointment_status import (
    AppointmentStatusCreate,
    AppointmentStatusUpdate,
    AppointmentStatusResponse,
)

router = APIRouter(prefix="/appointmentStatuses", tags=["appointmentStatuses"])


@router.get("", response_model=list[AppointmentStatusResponse])
def list_statuses(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentStatuses ORDER BY code")
        rows = cur.fetchall()
    return [AppointmentStatusResponse(**r) for r in rows]


@router.get("/{status_id}", response_model=AppointmentStatusResponse)
def get_status(status_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentStatuses WHERE id = %s", (status_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Status not found"})
    return AppointmentStatusResponse(**row)


@router.post("", response_model=AppointmentStatusResponse, status_code=201)
def create_status(data: AppointmentStatusCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO appointmentStatuses (code, color) VALUES (%s, %s)",
            (data.code, data.color),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        sid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentStatuses WHERE id = %s", (sid,))
        row = cur.fetchone()
    return AppointmentStatusResponse(**row)


@router.patch("/{status_id}", response_model=AppointmentStatusResponse)
def update_status(
    status_id: int, data: AppointmentStatusUpdate, current_user: dict = Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_status(status_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [status_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE appointmentStatuses SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Status not found"})
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentStatuses WHERE id = %s", (status_id,))
        row = cur.fetchone()
    return AppointmentStatusResponse(**row)


@router.delete("/{status_id}", status_code=204)
def delete_status(status_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM appointmentStatuses WHERE id = %s", (status_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Status not found"})
