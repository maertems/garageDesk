"""Référentiel des états de rendez-vous.

Modifiable depuis Paramètres → Calendrier : libellé, couleur, ordre, création et
suppression. Le libellé est en base depuis la migration 032 — il vivait dans
`labels.ts`, donc dans le code, et ajouter une entrée exigeait un déploiement.

**Lecture ouverte, écriture réservée aux administrateurs.** La liste est lue par
le calendrier et par les formulaires, donc par tout le monde ; la modifier touche
un référentiel que partagent tous les rendez-vous.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_admin, get_current_user
from app.database import db_cursor
from app.schemas.appointment_status import (
    AppointmentStatusCreate,
    AppointmentStatusUpdate,
    AppointmentStatusResponse,
)

router = APIRouter(prefix="/appointmentStatuses", tags=["appointmentStatuses"])

_COLONNES = "id, code, label, color, sortOrder"

# Tri par `sortOrder` et non par `code` : l'ordre alphabétique du code anglais
# donnait « Commande faite » avant « Commande à passer ». `code` ne sert plus que de départage.
_ORDRE = "ORDER BY sortOrder, code"


def _lire(cur, status_id: int):
    cur.execute(f"SELECT {_COLONNES} FROM appointmentStatuses WHERE id = %s", (status_id,))
    return cur.fetchone()


def _introuvable():
    raise HTTPException(
        status_code=404,
        detail={"code": "notFound", "message": "Status not found"},
    )


@router.get("", response_model=list[AppointmentStatusResponse])
def list_statuss(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLONNES} FROM appointmentStatuses {_ORDRE}")
        rows = cur.fetchall()
    return [AppointmentStatusResponse(**r) for r in rows]


@router.get("/{status_id}", response_model=AppointmentStatusResponse)
def get_status(status_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        row = _lire(cur, status_id)
    if not row:
        _introuvable()
    return AppointmentStatusResponse(**row)


@router.post("", response_model=AppointmentStatusResponse, status_code=201)
def create_status(data: AppointmentStatusCreate, current_user: dict = Depends(get_current_admin)):
    code = (data.code or "").strip()
    if not code:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid", "message": "Le code est obligatoire."},
        )
    with db_cursor(commit=True) as cur:
        # Le code identifie l'entrée partout ailleurs ; un doublon rendrait le
        # référentiel ambigu. La contrainte d'unicité existe en base, on rend ici
        # un message lisible plutôt qu'une erreur de pilote.
        cur.execute(f"SELECT id FROM appointmentStatuses WHERE code = %s", (code,))
        if cur.fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "duplicate", "message": f"Le code « {code} » existe déjà."},
            )
        # Sans ordre donné, l'entrée se range à la fin : dix après la dernière.
        ordre = data.sortOrder
        if not ordre:
            cur.execute(f"SELECT COALESCE(MAX(sortOrder), 0) AS m FROM appointmentStatuses")
            ordre = int(cur.fetchone()["m"]) + 10
        cur.execute(
            f"INSERT INTO appointmentStatuses (code, label, color, sortOrder) VALUES (%s, %s, %s, %s)",
            (code, (data.label or "").strip() or None, data.color, ordre),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        nouvel_id = cur.fetchone()["id"]
    with db_cursor() as cur:
        row = _lire(cur, nouvel_id)
    return AppointmentStatusResponse(**row)


@router.patch("/{status_id}", response_model=AppointmentStatusResponse)
def update_status(
    status_id: int,
    data: AppointmentStatusUpdate,
    current_user: dict = Depends(get_current_admin),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_status(status_id, current_user)
    if "code" in updates:
        code = (updates["code"] or "").strip()
        if not code:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid", "message": "Le code est obligatoire."},
            )
        updates["code"] = code
    if "label" in updates:
        updates["label"] = (updates["label"] or "").strip() or None

    with db_cursor(commit=True) as cur:
        if "code" in updates:
            cur.execute(
                f"SELECT id FROM appointmentStatuses WHERE code = %s AND id <> %s",
                (updates["code"], status_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail={"code": "duplicate",
                            "message": f"Le code « {updates['code']} » existe déjà."},
                )
        set_clause = ", ".join(f"`{k}` = %s" for k in updates)
        cur.execute(
            f"UPDATE appointmentStatuses SET {set_clause} WHERE id = %s",
            [*updates.values(), status_id],
        )
        if cur.rowcount == 0 and not _lire(cur, status_id):
            _introuvable()
    with db_cursor() as cur:
        row = _lire(cur, status_id)
    if not row:
        _introuvable()
    return AppointmentStatusResponse(**row)


@router.delete("/{status_id}", status_code=204)
def delete_status(status_id: int, current_user: dict = Depends(get_current_admin)):
    """Refuse la suppression tant que des rendez-vous s'y rattachent.

    La base ne porte **aucune contrainte de clé étrangère** (règle du projet) :
    rien n'empêcherait la ligne de partir en laissant des rendez-vous pointer
    dans le vide. Ils perdraient leur couleur et leur libellé sans que personne
    ne l'apprenne.

    Le compte est rendu dans le message : c'est lui qui dit quoi faire — les
    reporter sur une autre entrée avant de recommencer.
    """
    with db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM appointments WHERE statusId = %s",
            (status_id,),
        )
        utilises = int(cur.fetchone()["n"])
    if utilises:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "inUse",
                "message": (
                    f"Impossible de supprimer : {utilises} rendez-vous "
                    f"{'utilisent' if utilises > 1 else 'utilise'} cet état. "
                    "Reportez-les sur un autre avant de recommencer."
                ),
            },
        )
    with db_cursor(commit=True) as cur:
        cur.execute(f"DELETE FROM appointmentStatuses WHERE id = %s", (status_id,))
        if cur.rowcount == 0:
            _introuvable()
