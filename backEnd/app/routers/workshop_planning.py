from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.workshop_planning import WorkshopPlanningCreate, WorkshopPlanningResponse

router = APIRouter(prefix="/workshopPlanning", tags=["workshopPlanning"])

_SELECT_COLS = """
    wp.id,
    wp.vehicleId,
    wp.planDate,
    wp.appointmentId,
    a.startTime AS appointmentStartTime,
    v.brand,
    v.model,
    v.licensePlate,
    c.firstName AS clientFirstName,
    c.lastName  AS clientLastName
"""

_JOINS = """
    FROM workshopPlanning wp
    JOIN vehicles v ON v.id = wp.vehicleId
    LEFT JOIN appointments a ON a.id = wp.appointmentId
    LEFT JOIN (
        SELECT b1.vehicleId, b1.customerId
        FROM bills b1
        WHERE b1.id = (
            SELECT MAX(b2.id) FROM bills b2
            WHERE b2.vehicleId = b1.vehicleId AND b2.customerId IS NOT NULL
        )
    ) latest_bill ON latest_bill.vehicleId = wp.vehicleId
    LEFT JOIN clients c ON c.id = latest_bill.customerId
"""


@router.get("", response_model=list[WorkshopPlanningResponse])
def list_workshop_planning(
    week_start: date | None = Query(None, alias="weekStart"),
    current_user: dict = Depends(get_current_user),
):
    if week_start is None:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_SELECT_COLS} {_JOINS} WHERE wp.planDate BETWEEN %s AND %s ORDER BY wp.planDate, wp.id",
            (week_start, week_end),
        )
        rows = cur.fetchall()
    return [WorkshopPlanningResponse(**r) for r in rows]


@router.post("", response_model=WorkshopPlanningResponse, status_code=201)
def create_workshop_planning(
    data: WorkshopPlanningCreate,
    current_user: dict = Depends(get_current_user),
):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO workshopPlanning (vehicleId, planDate, appointmentId) VALUES (%s, %s, %s)",
            (data.vehicleId, data.planDate, data.appointmentId),
        )
        new_id = cur.lastrowid
        cur.execute(f"SELECT {_SELECT_COLS} {_JOINS} WHERE wp.id = %s", (new_id,))
        row = cur.fetchone()
    return WorkshopPlanningResponse(**row)


@router.delete("/{planning_id}", status_code=204)
def delete_workshop_planning(
    planning_id: int,
    current_user: dict = Depends(get_current_user),
):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM workshopPlanning WHERE id = %s", (planning_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Planning entry not found"})
