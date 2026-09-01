from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.bill import BillCreate, BillUpdate, BillResponse, BillListItemResponse
from app.schemas.bill_upsert import (
    UpsertBillPayload, UpsertBillResponse,
    UpsertCustomerInput, UpsertCarInput, UpsertDetailInput,
    EntityActionResult, DetailsSyncResult,
)
from app.services.vroomly import lookup_plate
from app.services.audit_service import log_event
from app.services.matching import (
    MATCH,
    best_match,
    champs_a_completer,
    score_client,
    score_vehicle,
)

router = APIRouter(prefix="/bills", tags=["bills"])


_BILL_SELECT = "id, billId, docId, docNum, vmodId, vehicleId, customerId AS clientId, account, dateDoc, dateBill, type, status, notBilled"

_TERMINAL_STATUSES = ("comptabilise", "edite", "annule", "notFound")

_LIST_QUERY = """
    SELECT b.id, b.billId, b.docNum, b.dateDoc, b.type, b.status,
           b.vehicleId, b.customerId AS clientId,
           v.brand AS vehicleBrand, v.model AS vehicleModel, v.licensePlate AS vehicleLicensePlate,
           c.firstName AS clientFirstName, c.lastName AS clientLastName
    FROM bills b
    LEFT JOIN vehicles v ON b.vehicleId = v.id
    LEFT JOIN clients c ON b.customerId = c.id
"""


@router.get("/pending", summary="Bills pending sync")
def get_pending_bills(current_user: dict = Depends(get_current_user)):
    ph = ", ".join(["%s"] * len(_TERMINAL_STATUSES))
    with db_cursor() as cur:
        cur.execute(f"SELECT MAX(billId) AS lastId FROM bills")
        last_id = (cur.fetchone() or {}).get("lastId") or 0
        cur.execute(
            f"SELECT billId FROM bills WHERE status NOT IN ({ph}) ORDER BY billId",
            _TERMINAL_STATUSES,
        )
        bill_ids = [r["billId"] for r in cur.fetchall()]
    return {"status": 100, "lastId": last_id, "billToCheck": bill_ids}


@router.get("", response_model=list[BillListItemResponse], summary="List bills")
def list_bills(
    current_user: dict = Depends(get_current_user),
    client_id: int | None = Query(None, alias="clientId"),
    vehicle_id: int | None = Query(None, alias="vehicleId"),
):
    with db_cursor() as cur:
        if client_id is not None:
            cur.execute(_LIST_QUERY + " WHERE b.customerId = %s ORDER BY b.dateDoc DESC, b.id DESC", (client_id,))
        elif vehicle_id is not None:
            cur.execute(_LIST_QUERY + " WHERE b.vehicleId = %s ORDER BY b.dateDoc DESC, b.id DESC", (vehicle_id,))
        else:
            cur.execute(_LIST_QUERY + " ORDER BY b.dateDoc DESC, b.id DESC")
        rows = cur.fetchall()
    return [BillListItemResponse(**r) for r in rows]


@router.get("/{bill_id}", response_model=BillResponse)
def get_bill(bill_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_BILL_SELECT} FROM bills WHERE id = %s", (bill_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill not found"})
    return BillResponse(**row)


@router.post("", response_model=BillResponse, status_code=201)
def create_bill(data: BillCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO bills (billId, docId, docNum, vmodId, vehicleId, customerId, account, dateDoc, dateBill, type, status, notBilled)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.billId,
                data.docId,
                data.docNum,
                data.vmodId,
                data.vehicleId,
                data.clientId,
                data.account,
                data.dateDoc,
                data.dateBill,
                data.type,
                data.status,
                data.notBilled,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        bill_id = cur.fetchone()["id"]
    return get_bill(bill_id, current_user)


@router.patch("/{bill_id}", response_model=BillResponse)
def update_bill(bill_id: int, data: BillUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_bill(bill_id, current_user)
    # Map clientId → customerId (actual DB column name)
    if "clientId" in updates:
        updates["customerId"] = updates.pop("clientId")
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [bill_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE bills SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill not found"})
    return get_bill(bill_id, current_user)


@router.delete("/{bill_id}", status_code=204)
def delete_bill(bill_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM bills WHERE id = %s", (bill_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill not found"})


# ─── Bill upsert ────────────────────────────────────────────────────────────

def _get_t_prices(cur) -> tuple[float, float, float]:
    cur.execute("SELECT `key`, `value` FROM settings WHERE `key` IN ('priceT1', 'priceT2', 'priceT3')")
    prices = {r["key"]: float(r["value"]) for r in cur.fetchall()}
    return prices.get("priceT1", 75.0), prices.get("priceT2", 89.0), prices.get("priceT3", 98.0)


def _time_equivalent_t1(det: UpsertDetailInput, price_t1: float) -> Optional[float]:
    if det.type != "MI":
        return None
    if det.time is None or det.price_ht is None or price_t1 == 0:
        return None
    return round(det.time * det.price_ht / price_t1, 4)


def _detail_key(ref, desc, time) -> tuple:
    return (
        (ref or "").strip(),
        (desc or "").strip(),
        round(float(time), 4) if time is not None else None,
    )


def _floats_equal(a, b) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return round(float(a), 2) == round(float(b), 2)


def _parse_date(s) -> Optional[date]:
    if not s:
        return None
    try:
        parts = str(s).split("-")
        return date(int(parts[0]), int(parts[1]), int(parts[2]))
    except Exception:
        return None


# Champs qu'un rapprochement peut compléter côté client. `vmId` en tête : c'est
# l'ancrage, et sans lui le rapprochement se rejouerait à chaque envoi.
# `accountNumber` n'y figure PAS : le numéro de compte arrive bien sur l'en-tête de
# facture (`bills.account`), mais rien n'établit qu'il désigne la même chose que le
# compte comptable du client. Le remonter écrirait peut-être une valeur fausse sur la
# fiche. Il reste saisi à la main sur la fiche client (§ 74).
_CLIENT_FILLABLE = [
    "vmId", "gender", "firstName", "lastName",
    "phone", "email", "address", "postalCode", "city",
    "vatNumber", "siren",
]

# Champs qu'un rapprochement peut compléter côté véhicule. Ni `brand` ni `model` :
# décision du garage, nos informations sont réputées plus fiables que celles du
# script, et une immatriculation identique avec une autre marque est presque
# toujours une donnée fausse en face.
_VEHICLE_FILLABLE = ["vmId", "vin", "type", "registrationDate"]


def _completer(cur, table: str, entity_id: int, entrant: dict, local: dict,
               champs: list[str], score: float, user_id=None) -> dict:
    """Remplit les champs vides de l'enregistrement local. Ne remplace jamais.

    Retourne ce qui a été écrit, et le consigne dans auditEvents : un rapprochement
    automatique doit rester explicable après coup, d'autant qu'il est irréversible en
    pratique — une fois le `vmId` posé, le chemin rapide s'applique.
    """
    a_completer = champs_a_completer(entrant, local, champs)
    if not a_completer:
        return {}
    set_clause = ", ".join(f"`{k}` = %s" for k in a_completer)
    cur.execute(
        f"UPDATE {table} SET {set_clause} WHERE id = %s",
        list(a_completer.values()) + [entity_id],
    )
    log_event(
        cur,
        event_type="syncMatched",
        entity_type="client" if table == "clients" else "vehicle",
        entity_id=entity_id,
        user_id=user_id,
        payload={"score": round(score, 3), "completed": a_completer},
    )
    return a_completer


def _resolve_customer(cur, customer: UpsertCustomerInput) -> tuple[int, str]:
    """Rapproche le client poussé d'un client existant, ou le crée.

    Trois chemins, dans cet ordre :

      1. `vmId` connu — l'ancrage, décisif ;
      2. sinon, rapprochement PAR SCORE sur les clients que nous avons créés
         nous-mêmes (`vmId IS NULL`), sur nom, prénom et ville normalisés ;
      3. sinon, création.

    Le rapprochement complète les champs vides dans les deux premiers cas — c'est
    précisément ce que l'ancienne version ne faisait pas : elle rendait l'identifiant
    sans jamais poser le `vmId`, si bien que le même client était re-rapproché à
    chaque envoi et que l'autre système n'obtenait jamais sa clé.
    """
    entrant = {
        "vmId": customer.vm_id,
        "gender": customer.gender,
        "firstName": customer.first_name,
        "lastName": customer.last_name,
        "phone": str(customer.phone) if customer.phone is not None else None,
        "email": customer.email,
        "address": customer.address,
        "postalCode": str(customer.postal_code) if customer.postal_code is not None else None,
        "city": customer.city,
        "vatNumber": customer.vat_number,
        "siren": customer.siren,
    }
    colonnes = ", ".join(["id"] + [f"`{c}`" for c in _CLIENT_FILLABLE])

    if customer.vm_id:
        cur.execute(
            f"SELECT {colonnes} FROM clients WHERE vmId = %s ORDER BY id LIMIT 1",
            (customer.vm_id,),
        )
        row = cur.fetchone()
        if row:
            _completer(cur, "clients", row["id"], entrant, row, _CLIENT_FILLABLE, 1.0)
            return row["id"], "found"

    # Candidats : ceux que NOUS avons créés, donc sans ancrage. Les autres portent
    # déjà un vmId et sont atteints par le chemin rapide ci-dessus.
    #
    # Ordre par id croissant : à égalité de score, la fiche la plus ancienne gagne,
    # c'est elle qui porte l'historique.
    cur.execute(f"SELECT {colonnes} FROM clients WHERE vmId IS NULL ORDER BY id")
    candidats = cur.fetchall()
    trouve, score = best_match(entrant, candidats, score_client)
    if trouve and score >= MATCH:
        _completer(cur, "clients", trouve["id"], entrant, trouve, _CLIENT_FILLABLE, score)
        return trouve["id"], "matched"
    meilleur_score_ecarte = score

    cur.execute(
        "INSERT INTO clients (gender, firstName, lastName, phone, email, address, postalCode, city, "
        "clientType, vatNumber, siren, vmId) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            customer.gender, customer.first_name, customer.last_name,
            str(customer.phone) if customer.phone is not None else None,
            customer.email, customer.address,
            str(customer.postal_code) if customer.postal_code is not None else None,
            customer.city, customer.client_type or "individual",
            customer.vat_number, customer.siren, customer.vm_id,
        ),
    )
    client_id = cur.lastrowid
    cur.execute("INSERT INTO synchronization (`key`, `value`) VALUES ('newClient', %s)", (str(client_id),))
    # Trace de création : c'est elle qui permet de repérer un doublon dans le rapport.
    # Le score du meilleur candidat écarté y figure — c'est l'information qui dit si
    # on est passé près d'un rapprochement, donc si le seuil mérite d'être revu.
    log_event(
        cur,
        event_type="syncCreated",
        entity_type="client",
        entity_id=client_id,
        payload={
            "lastName": customer.last_name,
            "firstName": customer.first_name,
            "city": customer.city,
            "vmId": customer.vm_id,
            "bestRejectedScore": round(meilleur_score_ecarte, 3),
        },
    )
    return client_id, "created"


def _insert_vehicle(cur, client_id: int, car: UpsertCarInput, vroomly: dict,
                    rejected_score: float | None = None) -> int:
    if vroomly.get("found"):
        brand = vroomly.get("brand") or car.brand
        model = vroomly.get("model") or car.model
        type_ = vroomly.get("type") or car.type
        vin = vroomly.get("vin") or car.vin
        reg_str = vroomly.get("registrationDate")
        if not reg_str or reg_str == "1111-11-11":
            reg_date: Optional[date] = date(1111, 11, 11)
        else:
            reg_date = _parse_date(reg_str)
    elif vroomly.get("error"):
        brand, model, type_, vin = car.brand, car.model, car.type, car.vin
        reg_date = None
    else:
        brand, model, type_, vin = car.brand, car.model, car.type, car.vin
        reg_date = _parse_date(car.registration_date)

    cur.execute(
        "INSERT INTO vehicles (clientId, brand, model, licensePlate, vin, vmId, `type`, registrationDate) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (client_id, brand, model, car.license_plate, vin, car.vm_id, type_, reg_date),
    )
    vehicle_id = cur.lastrowid
    cur.execute("INSERT INTO synchronization (`key`, `value`) VALUES ('newVehicle', %s)", (str(vehicle_id),))
    log_event(
        cur,
        event_type="syncCreated",
        entity_type="vehicle",
        entity_id=vehicle_id,
        payload={
            "licensePlate": car.license_plate,
            "brand": brand,
            "vmId": car.vm_id,
            "clientId": client_id,
            "bestRejectedScore": round(rejected_score, 3) if rejected_score is not None else None,
        },
    )
    return vehicle_id


def _resolve_vehicle(cur, client_id: int, car: UpsertCarInput) -> tuple[Optional[int], str]:
    """Rapproche le véhicule poussé d'un véhicule existant, ou le crée.

    Deux corrections par rapport à l'ancienne version, qui ne traitait que le cas du
    `vmId` connu :

      * un véhicule SANS `vmId` était purement ignoré (`skipped`), donc jamais créé
        ni rapproché ;
      * un `vmId` inconnu provoquait une création SANS regarder l'immatriculation,
        d'où un doublon garanti avec le véhicule saisi par le garage.

    L'immatriculation décide. La recherche commence par les véhicules du client déjà
    résolu — un même véhicule appartient au même client des deux côtés — puis
    s'élargit à ceux que nous avons créés sans ancrage.
    """
    colonnes = ", ".join(["id", "clientId", "`licensePlate`", "`brand`"]
                         + [f"`{c}`" for c in _VEHICLE_FILLABLE])
    entrant = {
        "vmId": car.vm_id,
        "licensePlate": car.license_plate,
        "brand": car.brand,
        "vin": car.vin,
        "type": car.type,
        "registrationDate": _parse_date(car.registration_date),
    }

    if car.vm_id:
        cur.execute(
            f"SELECT {colonnes} FROM vehicles WHERE vmId = %s ORDER BY id LIMIT 1",
            (car.vm_id,),
        )
        row = cur.fetchone()
        if row:
            _completer(cur, "vehicles", row["id"], entrant, row, _VEHICLE_FILLABLE, 1.0)
            return row["id"], "found"

    if not car.license_plate:
        # Sans immatriculation, aucun rapprochement n'est défendable : la marque seule
        # ne distingue rien. On crée, quitte à faire un doublon visible.
        # Sans immatriculation, aucun candidat n'a même été évalué : le score
        # écarté n'existe pas, et le rapport le montrera comme tel.
        return _insert_vehicle(cur, client_id, car, {}, None), "created"

    # D'abord les véhicules de ce client, puis les autres sans ancrage.
    cur.execute(
        f"SELECT {colonnes} FROM vehicles WHERE clientId = %s ORDER BY id",
        (client_id,),
    )
    candidats = cur.fetchall()
    trouve, score = best_match(entrant, candidats, score_vehicle)
    if not (trouve and score >= MATCH):
        cur.execute(
            f"SELECT {colonnes} FROM vehicles WHERE vmId IS NULL AND clientId <> %s ORDER BY id",
            (client_id,),
        )
        trouve, score = best_match(entrant, cur.fetchall(), score_vehicle)

    if trouve and score >= MATCH:
        _completer(cur, "vehicles", trouve["id"], entrant, trouve, _VEHICLE_FILLABLE, score)
        return trouve["id"], "matched"

    # Création : c'est le seul cas où l'on interroge Vroomly, un appel réseau qui n'a
    # pas de raison d'être quand on vient de retrouver le véhicule chez nous.
    vroomly = lookup_plate(car.license_plate)
    return _insert_vehicle(cur, client_id, car, vroomly, score), "created"


def _sync_details(bill_id: int, detail_inputs: list, price_t1: float) -> DetailsSyncResult:
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, reference, description, time, `type`, priceHT, price, unitPrice, "
            "taxeType, taxe, cashBack, timeEquivalentT1 FROM billDetails WHERE billId = %s",
            (bill_id,),
        )
        existing = cur.fetchall()

    db_by_key: dict = defaultdict(list)
    for row in existing:
        db_by_key[_detail_key(row["reference"], row["description"], row["time"])].append(dict(row))

    inserted = updated = deleted = unchanged = 0

    for det in detail_inputs:
        teq = _time_equivalent_t1(det, price_t1)
        key = _detail_key(det.reference, det.description, det.time)

        if db_by_key[key]:
            db_row = db_by_key[key].pop(0)
            changed: dict = {}
            if (det.type or "") != (db_row.get("type") or ""):
                changed["type"] = det.type
            if not _floats_equal(det.price_ht, db_row.get("priceHT")):
                changed["priceHT"] = det.price_ht
            if not _floats_equal(det.price, db_row.get("price")):
                changed["price"] = det.price
            if (det.unit_price or "") != (db_row.get("unitPrice") or ""):
                changed["unitPrice"] = det.unit_price
            if (det.taxe_type or "") != (db_row.get("taxeType") or ""):
                changed["taxeType"] = det.taxe_type
            if not _floats_equal(det.taxe, db_row.get("taxe")):
                changed["taxe"] = det.taxe
            if not _floats_equal(det.cash_back, db_row.get("cashBack")):
                changed["cashBack"] = det.cash_back
            if not _floats_equal(teq, db_row.get("timeEquivalentT1")):
                changed["timeEquivalentT1"] = teq

            if changed:
                set_clause = ", ".join(f"`{k}` = %s" for k in changed)
                with db_cursor(commit=True) as cur:
                    cur.execute(
                        f"UPDATE billDetails SET {set_clause} WHERE id = %s",
                        [*changed.values(), db_row["id"]],
                    )
                updated += 1
            else:
                unchanged += 1
        else:
            with db_cursor(commit=True) as cur:
                cur.execute(
                    "INSERT INTO billDetails (billId, `type`, priceHT, reference, time, timeEquivalentT1, "
                    "description, price, unitPrice, cashBack, taxe, taxeType) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        bill_id, det.type, det.price_ht, det.reference, det.time, teq,
                        det.description, det.price, det.unit_price, det.cash_back,
                        det.taxe, det.taxe_type,
                    ),
                )
            inserted += 1

    for rows in db_by_key.values():
        for db_row in rows:
            with db_cursor(commit=True) as cur:
                cur.execute("DELETE FROM billDetails WHERE id = %s", (db_row["id"],))
            deleted += 1

    return DetailsSyncResult(inserted=inserted, updated=updated, deleted=deleted, unchanged=unchanged)


@router.post("/upsert", response_model=UpsertBillResponse)
def upsert_bill(payload: UpsertBillPayload, current_user: dict = Depends(get_current_user)):
    """Reçoit une facture du script extérieur : client, véhicule, facture, lignes.

    Le corps est enrobé d'un garde qui journalise l'échec. La trace est écrite sur
    une connexion NEUVE, volontairement : celle de l'opération fautive est en cours
    d'annulation, et une trace posée dedans serait annulée avec elle — l'erreur
    resterait alors invisible, ce qui est exactement ce qu'on cherche à éviter.
    """
    try:
        return _upsert_bill(payload, current_user)
    except Exception as exc:
        try:
            with db_cursor(commit=True) as cur:
                log_event(
                    cur,
                    event_type="syncFailed",
                    entity_type="bill",
                    entity_id=getattr(payload.header.bill, "bill_id", None),
                    user_id=current_user.get("id"),
                    payload={
                        "error": f"{type(exc).__name__}: {exc}"[:800],
                        # De quoi retrouver l'envoi côté script sans conserver
                        # toute la charge, qui peut être volumineuse.
                        "billId": getattr(payload.header.bill, "bill_id", None),
                        "docNum": getattr(payload.header.bill, "doc_num", None),
                        "licensePlate": getattr(payload.header.car, "license_plate", None),
                        "lastName": getattr(payload.header.customer, "last_name", None),
                        "detailCount": len(payload.detail),
                    },
                )
        except Exception:
            # La trace ne doit jamais masquer l'erreur d'origine : si même elle
            # échoue — base injoignable, par exemple —, on laisse remonter la vraie.
            pass
        raise


def _upsert_bill(payload: UpsertBillPayload, current_user: dict) -> UpsertBillResponse:
    # T-price multipliers for timeEquivalentT1
    with db_cursor() as cur:
        price_t1, _t2, _t3 = _get_t_prices(cur)

    hbill = payload.header.bill

    # Resolve / match / create customer
    with db_cursor(commit=True) as cur:
        client_id, client_action = _resolve_customer(cur, payload.header.customer)

    # Resolve / match / create vehicle
    vehicle_id: Optional[int] = None
    vehicle_action = "skipped"
    car = payload.header.car
    if car:
        with db_cursor(commit=True) as cur:
            vehicle_id, vehicle_action = _resolve_vehicle(cur, client_id, car)

    # Upsert bill
    with db_cursor() as cur:
        cur.execute("SELECT id FROM bills WHERE billId = %s", (hbill.bill_id,))
        existing_bill = cur.fetchone()

    account_val = str(hbill.account) if hbill.account is not None else None
    with db_cursor(commit=True) as cur:
        if existing_bill:
            cur.execute(
                "UPDATE bills SET docId=%s, docNum=%s, vehicleId=%s, customerId=%s, account=%s, "
                "dateDoc=%s, dateBill=%s, `type`=%s, status=%s WHERE billId=%s",
                (
                    hbill.doc_id, hbill.doc_num, vehicle_id, client_id, account_val,
                    hbill.date_doc, hbill.date_bill, hbill.type, hbill.status, hbill.bill_id,
                ),
            )
            bill_action = "updated"
        else:
            cur.execute(
                "INSERT INTO bills (billId, docId, docNum, vehicleId, customerId, account, dateDoc, dateBill, `type`, status) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    hbill.bill_id, hbill.doc_id, hbill.doc_num, vehicle_id, client_id, account_val,
                    hbill.date_doc, hbill.date_bill, hbill.type, hbill.status,
                ),
            )
            bill_action = "created"

    # Sync bill details
    details_result = _sync_details(hbill.bill_id, payload.detail, price_t1)

    return UpsertBillResponse(
        bill_id=hbill.bill_id,
        client_id=client_id,
        vehicle_id=vehicle_id,
        client=EntityActionResult(action=client_action, id=client_id),
        vehicle=EntityActionResult(action=vehicle_action, id=vehicle_id),
        bill=EntityActionResult(action=bill_action),
        details=details_result,
    )
