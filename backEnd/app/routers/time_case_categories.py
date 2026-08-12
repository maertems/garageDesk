from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.time_case_category import TimeCaseCategoryCreate, TimeCaseCategoryUpdate, TimeCaseCategoryResponse

router = APIRouter(prefix="/timeCaseCategories", tags=["time-case-categories"])


@router.get("", response_model=list[TimeCaseCategoryResponse], summary="List time case categories")
def list_time_case_categories(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, name FROM timeCaseCategories ORDER BY name")
        rows = cur.fetchall()
    return [TimeCaseCategoryResponse(**r) for r in rows]


@router.get("/{category_id}", response_model=TimeCaseCategoryResponse)
def get_time_case_category(category_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, name FROM timeCaseCategories WHERE id = %s", (category_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case category not found"})
    return TimeCaseCategoryResponse(**row)


@router.post("", response_model=TimeCaseCategoryResponse, status_code=201)
def create_time_case_category(data: TimeCaseCategoryCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO timeCaseCategories (name) VALUES (%s)", (data.name,))
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        category_id = cur.fetchone()["id"]
    return get_time_case_category(category_id, current_user)


@router.patch("/{category_id}", response_model=TimeCaseCategoryResponse)
def update_time_case_category(
    category_id: int, data: TimeCaseCategoryUpdate, current_user: dict = Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_time_case_category(category_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [category_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE timeCaseCategories SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case category not found"})
    return get_time_case_category(category_id, current_user)


@router.delete("/{category_id}", status_code=204)
def delete_time_case_category(category_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM timeCaseCategories WHERE id = %s", (category_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case category not found"})
