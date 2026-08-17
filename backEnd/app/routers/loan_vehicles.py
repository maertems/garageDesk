import logging

from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor, db_transaction
from app.auth import get_current_user
from app.schemas.loan_vehicle import LoanVehicleCreate, LoanVehicleUpdate, LoanVehicleResponse
from app.schemas.loan_vehicle_damage import LoanVehicleDamageCreate, LoanVehicleDamageResponse

router = APIRouter(prefix="/loanVehicles", tags=["loanVehicles"])

DAMAGE_COLUMNS = "id, loanVehicleId, element, cellRow, cellCol, `type`, note"


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
    # db_transaction et non db_cursor : les deux suppressions doivent réussir ou
    # échouer ensemble, et c'est l'outil que le projet réserve aux opérations
    # atomiques multi-instructions. Il annule explicitement sur exception, au lieu
    # de s'en remettre à la fermeture de connexion.
    with db_transaction() as cur:
        # Les dégâts d'abord. La base ne porte aucune contrainte de clé étrangère
        # — règle du projet, les dépendances sont gérées ici — donc rien ne les
        # supprimerait à notre place : ils resteraient orphelins, et ressurgiraient
        # sur le prochain véhicule qui hériterait de cet identifiant.
        #
        # Dans cet ordre, et dans la même transaction : supprimer le véhicule
        # d'abord laisserait une fenêtre où ses dégâts pointent dans le vide.
        cur.execute("DELETE FROM loanVehicleDamages WHERE loanVehicleId = %s", (vehicle_id,))
        damages = cur.rowcount

        cur.execute("DELETE FROM loanVehicles WHERE id = %s", (vehicle_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Loan vehicle not found"})
        if damages:
            logging.getLogger(__name__).info(
                "Véhicule de prêt %s supprimé avec %s dégât(s) associé(s)", vehicle_id, damages
            )


# ---------------------------------------------------------------------------
# Dégâts (migration 025)
#
# Attachés au véhicule, pas à la réservation : ils décrivent l'état courant de la
# carrosserie et sont pré-imprimés sur le contrat de location. Ajout et retrait
# seulement — corriger une note se fait en supprimant puis recréant la ligne.
# ---------------------------------------------------------------------------


def _ensure_loan_vehicle_exists(vehicle_id: int) -> None:
    with db_cursor() as cur:
        cur.execute("SELECT id FROM loanVehicles WHERE id = %s", (vehicle_id,))
        if cur.fetchone() is None:
            raise HTTPException(
                status_code=404, detail={"code": "notFound", "message": "Loan vehicle not found"}
            )


@router.get("/{vehicle_id}/damages", response_model=list[LoanVehicleDamageResponse])
def list_loan_vehicle_damages(vehicle_id: int, current_user: dict = Depends(get_current_user)):
    _ensure_loan_vehicle_exists(vehicle_id)
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {DAMAGE_COLUMNS} FROM loanVehicleDamages WHERE loanVehicleId = %s"
            " ORDER BY element, cellRow, cellCol, id",
            (vehicle_id,),
        )
        rows = cur.fetchall()
    return [LoanVehicleDamageResponse(**r) for r in rows]


@router.post("/{vehicle_id}/damages", response_model=LoanVehicleDamageResponse, status_code=201)
def create_loan_vehicle_damage(
    vehicle_id: int, data: LoanVehicleDamageCreate, current_user: dict = Depends(get_current_user)
):
    _ensure_loan_vehicle_exists(vehicle_id)
    note = (data.note or "").strip() or None
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO loanVehicleDamages (loanVehicleId, element, cellRow, cellCol, `type`, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (vehicle_id, data.element, data.cellRow, data.cellCol, data.type, note),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        did = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(f"SELECT {DAMAGE_COLUMNS} FROM loanVehicleDamages WHERE id = %s", (did,))
        row = cur.fetchone()
    return LoanVehicleDamageResponse(**row)


@router.delete("/{vehicle_id}/damages/{damage_id}", status_code=204)
def delete_loan_vehicle_damage(
    vehicle_id: int, damage_id: int, current_user: dict = Depends(get_current_user)
):
    # loanVehicleId dans le WHERE : un id de dégât d'un autre véhicule renvoie 404
    # au lieu de supprimer silencieusement la ligne d'à côté.
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM loanVehicleDamages WHERE id = %s AND loanVehicleId = %s",
            (damage_id, vehicle_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Damage not found"})
