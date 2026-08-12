from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.loan_reservation import (
    LoanReservationCreate,
    LoanReservationUpdate,
    LoanReservationResponse,
    LoanReservationWithJoinsResponse,
)

router = APIRouter(prefix="/loanReservations", tags=["loanReservations"])


@router.get("", response_model=list[LoanReservationWithJoinsResponse])
def list_loan_reservations(
    current_user: dict = Depends(get_current_user),
    loan_vehicle_id: int | None = Query(None, alias="loanVehicleId"),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    with db_cursor() as cur:
        conditions = []
        params = []
        if loan_vehicle_id is not None:
            conditions.append("lr.loanVehicleId = %s")
            params.append(loan_vehicle_id)
        if start:
            conditions.append("lr.startDate >= %s")
            params.append(start)
        if end:
            conditions.append("(lr.endDate <= %s OR lr.endDate IS NULL)")
            params.append(end)
        where = " AND ".join(conditions) if conditions else "1=1"
        cur.execute(
            f"""
            SELECT lr.id, lr.loanVehicleId, lr.clientId, lr.appointmentId, lr.startDate, lr.endDate,
                   lr.startMileage, lr.fuelLevelEighths, lr.endMileage, lr.endFuelLevelEighths,
                   lv.uniqueNumber AS loanVehicleUniqueNumber,
                   lv.licensePlate AS loanVehicleLicensePlate,
                   lv.brand AS loanVehicleBrand, lv.model AS loanVehicleModel,
                   c.firstName AS clientFirstName, c.lastName AS clientLastName
            FROM loanReservations lr
            JOIN loanVehicles lv ON lv.id = lr.loanVehicleId
            JOIN clients c ON c.id = lr.clientId
            WHERE {where}
            ORDER BY lr.startDate DESC
            """,
            params,
        )
        rows = cur.fetchall()
    return [LoanReservationWithJoinsResponse(**r) for r in rows]


@router.get("/{reservation_id}", response_model=LoanReservationWithJoinsResponse)
def get_loan_reservation(reservation_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT lr.id, lr.loanVehicleId, lr.clientId, lr.appointmentId, lr.startDate, lr.endDate,
                   lr.startMileage, lr.fuelLevelEighths, lr.endMileage, lr.endFuelLevelEighths,
                   lv.uniqueNumber AS loanVehicleUniqueNumber,
                   lv.licensePlate AS loanVehicleLicensePlate,
                   lv.brand AS loanVehicleBrand, lv.model AS loanVehicleModel,
                   c.firstName AS clientFirstName, c.lastName AS clientLastName
            FROM loanReservations lr
            JOIN loanVehicles lv ON lv.id = lr.loanVehicleId
            JOIN clients c ON c.id = lr.clientId
            WHERE lr.id = %s
            """,
            (reservation_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan reservation not found"})
    return LoanReservationWithJoinsResponse(**row)


@router.post("", response_model=LoanReservationResponse, status_code=201)
def create_loan_reservation(data: LoanReservationCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO loanReservations (loanVehicleId, clientId, appointmentId, startDate, endDate, startMileage, fuelLevelEighths)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.loanVehicleId,
                data.clientId,
                data.appointmentId,
                data.startDate,
                data.endDate,
                data.startMileage,
                data.fuelLevelEighths,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        rid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, loanVehicleId, clientId, appointmentId, startDate, endDate, startMileage, fuelLevelEighths, endMileage, endFuelLevelEighths FROM loanReservations WHERE id = %s",
            (rid,),
        )
        row = cur.fetchone()
    return LoanReservationResponse(**row)


@router.patch("/{reservation_id}", response_model=LoanReservationResponse)
def update_loan_reservation(
    reservation_id: int, data: LoanReservationUpdate, current_user: dict = Depends(get_current_user)
):
    with db_cursor() as cur:
        cur.execute("SELECT id FROM loanReservations WHERE id = %s", (reservation_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan reservation not found"})
    updates = data.model_dump(exclude_unset=True)
    if updates:
        set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
        values = list(updates.values()) + [reservation_id]
        with db_cursor(commit=True) as cur:
            cur.execute(f"UPDATE loanReservations SET {set_clause} WHERE id = %s", values)
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, loanVehicleId, clientId, appointmentId, startDate, endDate, startMileage, fuelLevelEighths, endMileage, endFuelLevelEighths FROM loanReservations WHERE id = %s",
            (reservation_id,),
        )
        row = cur.fetchone()
    return LoanReservationResponse(**row)


@router.delete("/{reservation_id}", status_code=204)
def delete_loan_reservation(reservation_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM loanReservations WHERE id = %s", (reservation_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan reservation not found"})
