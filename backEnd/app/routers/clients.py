from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientWithVehiclesResponse
from app.schemas.vehicle import VehicleResponse

router = APIRouter(prefix="/clients", tags=["clients"])

_COLUMNS = ("id, gender, firstName, lastName, phone, email, address, postalCode, city, "
            "clientType, vatNumber, siren, accountNumber, vmId")
_VALID_SORT = {"lastName", "firstName", "city", "postalCode", "phone", "email"}


@router.get(
    "",
    response_model=list[ClientResponse] | list[ClientWithVehiclesResponse],
    summary="List clients",
    description="List clients. Use search to filter by any field (name, city, postalCode, phone, email). Use sortBy and order. Use withVehicles=true to include vehicles.",
)
def list_clients(
    current_user: dict = Depends(get_current_user),
    search: str | None = Query(None, description="Search in lastName, firstName, city, postalCode, phone, email"),
    sort_by: str | None = Query("lastName", alias="sortBy", description="Sort column: lastName, firstName, city, postalCode, phone, email"),
    order: str = Query("asc", description="Sort order: asc or desc"),
    with_vehicles: bool = Query(False, alias="withVehicles"),
):
    order_dir = "DESC" if order and order.lower() == "desc" else "ASC"
    sort_col = sort_by if sort_by in _VALID_SORT else "lastName"
    with db_cursor() as cur:
        if search:
            q = f"%{search}%"
            cur.execute(
                f"""
                SELECT {_COLUMNS}
                FROM clients
                WHERE lastName LIKE %s OR firstName LIKE %s OR city LIKE %s OR postalCode LIKE %s OR phone LIKE %s OR email LIKE %s
                ORDER BY {sort_col} {order_dir}, lastName, firstName
                """,
                (q, q, q, q, q, q),
            )
        else:
            cur.execute(
                f"""
                SELECT {_COLUMNS}
                FROM clients
                ORDER BY {sort_col} {order_dir}, lastName, firstName
                """
            )
        rows = cur.fetchall()
    if not with_vehicles:
        return [ClientResponse(**r) for r in rows]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate FROM vehicles ORDER BY clientId, licensePlate"
        )
        vehicles = cur.fetchall()
    by_client = {}
    for v in vehicles:
        cid = v["clientId"]
        if cid not in by_client:
            by_client[cid] = []
        by_client[cid].append(VehicleResponse(**v))
    result = []
    for r in rows:
        result.append(
            ClientWithVehiclesResponse(**r, vehicles=by_client.get(r["id"], []))
        )
    return result


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM clients WHERE id = %s",
            (client_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Client not found"})
    return ClientResponse(**row)


@router.post("", response_model=ClientResponse, status_code=201)
def create_client(data: ClientCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO clients (gender, firstName, lastName, phone, email, address, postalCode, city, clientType, vatNumber, siren, accountNumber, vmId)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.gender,
                data.firstName,
                data.lastName,
                data.phone,
                data.email,
                data.address,
                data.postalCode,
                data.city,
                data.clientType,
                data.vatNumber,
                data.siren,
                data.accountNumber,
                data.vmId,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        id_row = cur.fetchone()
        client_id = id_row["id"]
    with db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO synchronization (`key`, `value`) VALUES ('newClient', %s)", (str(client_id),))
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM clients WHERE id = %s",
            (client_id,),
        )
        row = cur.fetchone()
    return ClientResponse(**row)


@router.patch("/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, data: ClientUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_client(client_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [client_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE clients SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Client not found"})
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM clients WHERE id = %s",
            (client_id,),
        )
        row = cur.fetchone()
    return ClientResponse(**row)


@router.delete("/{client_id}", status_code=405)
def delete_client(client_id: int, current_user: dict = Depends(get_current_user)):
    # disabled
    raise HTTPException(status_code=405, detail={"code": "disabled", "message": "Client deletion is disabled"})
