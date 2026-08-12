from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.vehicle_detail import VehicleDetailCreate, VehicleDetailUpdate, VehicleDetailResponse

router = APIRouter(prefix="/vehicleDetails", tags=["vehicle-details"])


@router.get("", response_model=list[VehicleDetailResponse], summary="List vehicle details")
def list_vehicle_details(
    current_user: dict = Depends(get_current_user),
    vehicle_id: int | None = Query(None, alias="vehicleId"),
):
    with db_cursor() as cur:
        if vehicle_id is not None:
            cur.execute(
                "SELECT id, vehicleId, detailKey, detailValue FROM vehiclesDetails WHERE vehicleId = %s ORDER BY detailKey",
                (vehicle_id,),
            )
        else:
            cur.execute("SELECT id, vehicleId, detailKey, detailValue FROM vehiclesDetails ORDER BY vehicleId, detailKey")
        rows = cur.fetchall()
    return [VehicleDetailResponse(**r) for r in rows]


@router.get("/{detail_id}", response_model=VehicleDetailResponse)
def get_vehicle_detail(detail_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, vehicleId, detailKey, detailValue FROM vehiclesDetails WHERE id = %s",
            (detail_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Vehicle detail not found"})
    return VehicleDetailResponse(**row)


@router.post("", response_model=VehicleDetailResponse, status_code=201)
def create_vehicle_detail(data: VehicleDetailCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO vehiclesDetails (vehicleId, detailKey, detailValue) VALUES (%s, %s, %s)",
            (data.vehicleId, data.detailKey, data.detailValue),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        detail_id = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, vehicleId, detailKey, detailValue FROM vehiclesDetails WHERE id = %s",
            (detail_id,),
        )
        row = cur.fetchone()
    return VehicleDetailResponse(**row)


@router.patch("/{detail_id}", response_model=VehicleDetailResponse)
def update_vehicle_detail(detail_id: int, data: VehicleDetailUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_vehicle_detail(detail_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [detail_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE vehiclesDetails SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Vehicle detail not found"})
    return get_vehicle_detail(detail_id, current_user)


@router.delete("/{detail_id}", status_code=204)
def delete_vehicle_detail(detail_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM vehiclesDetails WHERE id = %s", (detail_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Vehicle detail not found"})
