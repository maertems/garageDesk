from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.common import PAGE_LIMIT_MAX, PageResponse
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleResponse, VehicleListResponse

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_LIST_SELECT = """
    SELECT v.id, v.clientId, v.brand, v.model, v.licensePlate, v.vin, v.mileage, v.vmId, v.type, v.registrationDate,
           c.firstName AS clientFirstName, c.lastName AS clientLastName
"""
_LIST_FROM = """
    FROM vehicles v
    LEFT JOIN clients c ON v.clientId = c.id
"""
_LIST_QUERY = _LIST_SELECT + _LIST_FROM

# Ce que la page des véhicules cherchait dans le navigateur, sur la liste
# complète : plaque, marque, modèle, type, date de mise en circulation sous ses
# deux écritures. Le nom du propriétaire s'y ajoute, puisqu'il est affiché.
_SEARCH_WHERE = (
    "(v.licensePlate LIKE %s OR v.brand LIKE %s OR v.model LIKE %s OR v.type LIKE %s "
    "OR DATE_FORMAT(v.registrationDate, '%%d/%%m/%%Y') LIKE %s OR v.registrationDate LIKE %s "
    "OR CONCAT_WS(' ', c.lastName, c.firstName) LIKE %s OR CONCAT_WS(' ', c.firstName, c.lastName) LIKE %s)"
)
_SEARCH_PARAMS = 8


@router.get(
    "",
    response_model=list[VehicleListResponse] | PageResponse[VehicleListResponse],
    description=(
        "List vehicles, optionally those of one client. Use search to filter "
        "(plate, brand, model, type, registration date, owner). With limit (and offset), "
        "returns a page: {items, total}."
    ),
)
def list_vehicles(
    current_user: dict = Depends(get_current_user),
    client_id: int | None = Query(None, alias="clientId"),
    search: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=PAGE_LIMIT_MAX, description="Page size; enables the paged response"),
    offset: int = Query(0, ge=0),
):
    conditions: list[str] = []
    params: list = []
    if client_id is not None:
        conditions.append("v.clientId = %s")
        params.append(client_id)
    if search:
        conditions.append(_SEARCH_WHERE)
        params.extend([f"%{search}%"] * _SEARCH_PARAMS)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    order_by = "ORDER BY v.licensePlate" if client_id is not None else "ORDER BY v.clientId, v.licensePlate"
    total = None
    with db_cursor() as cur:
        if limit is not None:
            cur.execute(f"SELECT COUNT(*) AS n {_LIST_FROM} {where}", params)
            total = cur.fetchone()["n"]
            cur.execute(f"{_LIST_QUERY} {where} {order_by} LIMIT %s OFFSET %s", params + [limit, offset])
        else:
            cur.execute(f"{_LIST_QUERY} {where} {order_by}", params)
        rows = cur.fetchall()
    items = [VehicleListResponse(**r) for r in rows]
    if total is None:
        return items
    return PageResponse(items=items, total=total)


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
