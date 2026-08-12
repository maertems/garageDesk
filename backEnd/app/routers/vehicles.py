from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse, VehicleListResponse

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_LIST_QUERY = """
    SELECT v.id, v.clientId, v.brand, v.model, v.licensePlate, v.vin, v.mileage, v.vmId, v.type, v.registrationDate,
           c.firstName AS clientFirstName, c.lastName AS clientLastName
    FROM vehicles v
    LEFT JOIN clients c ON v.clientId = c.id
"""


@router.get("", response_model=list[VehicleListResponse])
def list_vehicles(
    current_user: dict = Depends(get_current_user),
    client_id: int | None = Query(None, alias="clientId"),
):
    with db_cursor() as cur:
        if client_id is not None:
            cur.execute(_LIST_QUERY + " WHERE v.clientId = %s ORDER BY v.licensePlate", (client_id,))
        else:
            cur.execute(_LIST_QUERY + " ORDER BY v.clientId, v.licensePlate")
        rows = cur.fetchall()
    return [VehicleListResponse(**r) for r in rows]


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate FROM vehicles WHERE id = %s",
            (vehicle_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Vehicle not found"})
    return VehicleResponse(**row)


@router.post("", response_model=VehicleResponse, status_code=201)
def create_vehicle(data: VehicleCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO vehicles (clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (data.clientId, data.brand, data.model, data.licensePlate, data.vin, data.mileage, data.vmId, data.type, data.registrationDate),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        vehicle_id = cur.fetchone()["id"]
    with db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO synchronization (`key`, `value`) VALUES ('newVehicle', %s)", (str(vehicle_id),))
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate FROM vehicles WHERE id = %s",
            (vehicle_id,),
        )
        row = cur.fetchone()
    return VehicleResponse(**row)


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(vehicle_id: int, data: VehicleUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_vehicle(vehicle_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [vehicle_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE vehicles SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Vehicle not found"})
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate FROM vehicles WHERE id = %s",
            (vehicle_id,),
        )
        row = cur.fetchone()
    return VehicleResponse(**row)


@router.delete("/{vehicle_id}", status_code=405)
def delete_vehicle(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    # disabled
    raise HTTPException(status_code=405, detail={"code": "disabled", "message": "Vehicle deletion is disabled"})
