from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor, db_transaction
from app.auth import get_current_user
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientWithVehiclesResponse
from app.schemas.vehicle import VehicleResponse
from app.services.client_account_service import prochain_numero_de_compte

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
    by_client = _vehicles_by_client([r["id"] for r in rows])
    return [ClientWithVehiclesResponse(**r, vehicles=by_client.get(r["id"], [])) for r in rows]


# Au-delà de ce nombre de clients, les véhicules sont lus en une passe sur toute la
# table plutôt que par une liste `IN (...)` de milliers d'identifiants.
_VEHICLES_IN_LIST_MAX = 500


def _vehicles_by_client(client_ids: list[int]) -> dict[int, list[VehicleResponse]]:
    """Véhicules des clients donnés, groupés par client.

    La table `vehicles` était lue EN ENTIER à chaque `withVehicles=true`, même pour
    une recherche qui ne rendait que trois clients : 1 515 lignes et 320 Ko, à
    chaque frappe dans le sélecteur de client. Pour une liste courte, on ne lit que
    les véhicules de ces clients-là.
    """
    if not client_ids:
        return {}
    cols = "id, clientId, brand, model, licensePlate, vin, mileage, vmId, type, registrationDate"
    with db_cursor() as cur:
        if len(client_ids) <= _VEHICLES_IN_LIST_MAX:
            placeholders = ", ".join(["%s"] * len(client_ids))
            cur.execute(
                f"SELECT {cols} FROM vehicles WHERE clientId IN ({placeholders}) ORDER BY clientId, licensePlate",
                client_ids,
            )
        else:
            cur.execute(f"SELECT {cols} FROM vehicles ORDER BY clientId, licensePlate")
        vehicles = cur.fetchall()
    by_client: dict[int, list[VehicleResponse]] = {}
    for v in vehicles:
        by_client.setdefault(v["clientId"], []).append(VehicleResponse(**v))
    return by_client


@router.get(
    "/{client_id}",
    response_model=ClientResponse | ClientWithVehiclesResponse,
    description="Get one client. Use withVehicles=true to include its vehicles.",
)
def get_client(
    client_id: int,
    current_user: dict = Depends(get_current_user),
    with_vehicles: bool = Query(False, alias="withVehicles"),
):
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLUMNS} FROM clients WHERE id = %s",
            (client_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Client not found"})
    if not with_vehicles:
        return ClientResponse(**row)
    # Le formulaire de rendez-vous, en modification, n'a besoin que de CE client et
    # de ses véhicules — il téléchargeait la base entière pour les trouver.
    by_client = _vehicles_by_client([client_id])
    return ClientWithVehiclesResponse(**row, vehicles=by_client.get(client_id, []))


@router.post("", response_model=ClientResponse, status_code=201)
def create_client(data: ClientCreate, current_user: dict = Depends(get_current_user)):
    # `db_transaction` et non `db_cursor` : le numéro de compte est réservé par un
    # `SELECT ... FOR UPDATE` qui ne tient que jusqu'au commit. Avec deux
    # connexions, deux créations simultanées recevraient le même numéro.
    with db_transaction() as cur:
        # Le numéro est attribué ICI, jamais reçu du client : la demande du garage
        # est de ne plus le saisir. Un `accountNumber` présent dans la charge est
        # donc ignoré en silence — il n'a aucune autorité sur la série.
        numero = prochain_numero_de_compte(cur)
        cur.execute(
            """
            INSERT INTO clients (gender, firstName, lastName, phone, email, address, postalCode, city, clientType, vatNumber, siren, accountNumber, vmId)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                numero,
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
