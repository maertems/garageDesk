from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.loan_vehicle import LoanVehicleCreate, LoanVehicleUpdate, LoanVehicleResponse

router = APIRouter(prefix="/loanVehicles", tags=["loanVehicles"])


@router.get("", response_model=list[LoanVehicleResponse])
def list_loan_vehicles(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, brand, model, licensePlate, mileage, uniqueNumber, active FROM loanVehicles ORDER BY uniqueNumber"
        )
        rows = cur.fetchall()
    return [LoanVehicleResponse(**r) for r in rows]


@router.get("/{vehicle_id}", response_model=LoanVehicleResponse)
def get_loan_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, brand, model, licensePlate, mileage, uniqueNumber, active FROM loanVehicles WHERE id = %s",
            (vehicle_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan vehicle not found"})
    return LoanVehicleResponse(**row)


@router.post("", response_model=LoanVehicleResponse, status_code=201)
def create_loan_vehicle(data: LoanVehicleCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO loanVehicles (brand, model, licensePlate, mileage, uniqueNumber, active)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (data.brand, data.model, data.licensePlate, data.mileage, data.uniqueNumber, data.active),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        vid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, brand, model, licensePlate, mileage, uniqueNumber, active FROM loanVehicles WHERE id = %s",
            (vid,),
        )
        row = cur.fetchone()
    return LoanVehicleResponse(**row)


@router.patch("/{vehicle_id}", response_model=LoanVehicleResponse)
def update_loan_vehicle(
    vehicle_id: int, data: LoanVehicleUpdate, current_user: dict = Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_loan_vehicle(vehicle_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [vehicle_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE loanVehicles SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan vehicle not found"})
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, brand, model, licensePlate, mileage, uniqueNumber, active FROM loanVehicles WHERE id = %s",
            (vehicle_id,),
        )
        row = cur.fetchone()
    return LoanVehicleResponse(**row)


@router.delete("/{vehicle_id}", status_code=204)
def delete_loan_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM loanVehicles WHERE id = %s", (vehicle_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan vehicle not found"})
