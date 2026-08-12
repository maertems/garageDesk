from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeResponse])
def list_employees(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, firstName, lastName, category FROM employees ORDER BY lastName, firstName")
        rows = cur.fetchall()
    return [EmployeeResponse(**r) for r in rows]


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(employee_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, firstName, lastName, category FROM employees WHERE id = %s", (employee_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Employee not found"})
    return EmployeeResponse(**row)


@router.post("", response_model=EmployeeResponse, status_code=201)
def create_employee(data: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO employees (firstName, lastName, category) VALUES (%s, %s, %s)",
            (data.firstName, data.lastName, data.category),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        eid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute("SELECT id, firstName, lastName, category FROM employees WHERE id = %s", (eid,))
        row = cur.fetchone()
    return EmployeeResponse(**row)


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int, data: EmployeeUpdate, current_user: dict = Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_employee(employee_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [employee_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE employees SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Employee not found"})
    with db_cursor() as cur:
        cur.execute("SELECT id, firstName, lastName, category FROM employees WHERE id = %s", (employee_id,))
        row = cur.fetchone()
    return EmployeeResponse(**row)


@router.delete("/{employee_id}", status_code=204)
def delete_employee(employee_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM employees WHERE id = %s", (employee_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Employee not found"})
