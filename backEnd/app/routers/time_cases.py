from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.time_case import TimeCaseCreate, TimeCaseUpdate, TimeCaseResponse

router = APIRouter(prefix="/timeCases", tags=["time-cases"])


def _columns():
    return "id, employeeId, billId, time, type, date, comment"


@router.get("", response_model=list[TimeCaseResponse], summary="List time cases")
def list_time_cases(
    current_user: dict = Depends(get_current_user),
    employee_id: int | None = Query(None, alias="employeeId"),
    bill_id: int | None = Query(None, alias="billId"),
):
    with db_cursor() as cur:
        if employee_id is not None:
            cur.execute(
                f"SELECT {_columns()} FROM timeCase WHERE employeeId = %s ORDER BY date DESC, id DESC",
                (employee_id,),
            )
        elif bill_id is not None:
            cur.execute(
                f"SELECT {_columns()} FROM timeCase WHERE billId = %s ORDER BY date, id",
                (bill_id,),
            )
        else:
            cur.execute(f"SELECT {_columns()} FROM timeCase ORDER BY date DESC, id DESC")
        rows = cur.fetchall()
    return [TimeCaseResponse(**r) for r in rows]


@router.get("/{time_case_id}", response_model=TimeCaseResponse)
def get_time_case(time_case_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_columns()} FROM timeCase WHERE id = %s", (time_case_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case not found"})
    return TimeCaseResponse(**row)


@router.post("", response_model=TimeCaseResponse, status_code=201)
def create_time_case(data: TimeCaseCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO timeCase (employeeId, billId, time, type, date, comment) VALUES (%s, %s, %s, %s, %s, %s)",
            (data.employeeId, data.billId, data.time, data.type, data.date, data.comment),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        time_case_id = cur.fetchone()["id"]
    return get_time_case(time_case_id, current_user)


@router.patch("/{time_case_id}", response_model=TimeCaseResponse)
def update_time_case(time_case_id: int, data: TimeCaseUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_time_case(time_case_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [time_case_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE timeCase SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case not found"})
    return get_time_case(time_case_id, current_user)


@router.delete("/{time_case_id}", status_code=204)
def delete_time_case(time_case_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM timeCase WHERE id = %s", (time_case_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Time case not found"})
