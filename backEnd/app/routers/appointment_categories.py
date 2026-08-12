from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.appointment_category import (
    AppointmentCategoryCreate,
    AppointmentCategoryUpdate,
    AppointmentCategoryResponse,
)

router = APIRouter(prefix="/appointmentCategories", tags=["appointmentCategories"])


@router.get("", response_model=list[AppointmentCategoryResponse])
def list_categories(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentCategories ORDER BY code")
        rows = cur.fetchall()
    return [AppointmentCategoryResponse(**r) for r in rows]


@router.get("/{category_id}", response_model=AppointmentCategoryResponse)
def get_category(category_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentCategories WHERE id = %s", (category_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Category not found"})
    return AppointmentCategoryResponse(**row)


@router.post("", response_model=AppointmentCategoryResponse, status_code=201)
def create_category(data: AppointmentCategoryCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO appointmentCategories (code, color) VALUES (%s, %s)",
            (data.code, data.color),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        cid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentCategories WHERE id = %s", (cid,))
        row = cur.fetchone()
    return AppointmentCategoryResponse(**row)


@router.patch("/{category_id}", response_model=AppointmentCategoryResponse)
def update_category(
    category_id: int, data: AppointmentCategoryUpdate, current_user: dict = Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_category(category_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [category_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE appointmentCategories SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Category not found"})
    with db_cursor() as cur:
        cur.execute("SELECT id, code, color FROM appointmentCategories WHERE id = %s", (category_id,))
        row = cur.fetchone()
    return AppointmentCategoryResponse(**row)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM appointmentCategories WHERE id = %s", (category_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Category not found"})
