"""Référentiel des catégories de rendez-vous.

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
from app.schemas.appointment_category import (
    AppointmentCategoryCreate,
    AppointmentCategoryUpdate,
    AppointmentCategoryResponse,
)

router = APIRouter(prefix="/appointmentCategories", tags=["appointmentCategories"])

_COLONNES = "id, code, label, color, sortOrder"

# Tri par `sortOrder` et non par `code` : l'ordre alphabétique du code anglais
# donnait Carrosserie avant Mécanique. `code` ne sert plus que de départage.
_ORDRE = "ORDER BY sortOrder, code"


def _lire(cur, category_id: int):
    cur.execute(f"SELECT {_COLONNES} FROM appointmentCategories WHERE id = %s", (category_id,))
    return cur.fetchone()


def _introuvable():
    raise HTTPException(
        status_code=404,
        detail={"code": "notFound", "message": "Category not found"},
    )


@router.get("", response_model=list[AppointmentCategoryResponse])
def list_categorys(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLONNES} FROM appointmentCategories {_ORDRE}")
        rows = cur.fetchall()
    return [AppointmentCategoryResponse(**r) for r in rows]


@router.get("/{category_id}", response_model=AppointmentCategoryResponse)
def get_category(category_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        row = _lire(cur, category_id)
    if not row:
        _introuvable()
    return AppointmentCategoryResponse(**row)


@router.post("", response_model=AppointmentCategoryResponse, status_code=201)
def create_category(data: AppointmentCategoryCreate, current_user: dict = Depends(get_current_admin)):
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
        cur.execute(f"SELECT id FROM appointmentCategories WHERE code = %s", (code,))
        if cur.fetchone():
            raise HTTPException(
                status_code=409,
                detail={"code": "duplicate", "message": f"Le code « {code} » existe déjà."},
            )
        # Sans ordre donné, l'entrée se range à la fin : dix après la dernière.
        ordre = data.sortOrder
        if not ordre:
            cur.execute(f"SELECT COALESCE(MAX(sortOrder), 0) AS m FROM appointmentCategories")
            ordre = int(cur.fetchone()["m"]) + 10
        cur.execute(
            f"INSERT INTO appointmentCategories (code, label, color, sortOrder) VALUES (%s, %s, %s, %s)",
            (code, (data.label or "").strip() or None, data.color, ordre),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        nouvel_id = cur.fetchone()["id"]
    with db_cursor() as cur:
        row = _lire(cur, nouvel_id)
    return AppointmentCategoryResponse(**row)


@router.patch("/{category_id}", response_model=AppointmentCategoryResponse)
def update_category(
    category_id: int,
    data: AppointmentCategoryUpdate,
    current_user: dict = Depends(get_current_admin),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_category(category_id, current_user)
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
                f"SELECT id FROM appointmentCategories WHERE code = %s AND id <> %s",
                (updates["code"], category_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail={"code": "duplicate",
                            "message": f"Le code « {updates['code']} » existe déjà."},
                )
        set_clause = ", ".join(f"`{k}` = %s" for k in updates)
        cur.execute(
            f"UPDATE appointmentCategories SET {set_clause} WHERE id = %s",
            [*updates.values(), category_id],
        )
        if cur.rowcount == 0 and not _lire(cur, category_id):
            _introuvable()
    with db_cursor() as cur:
        row = _lire(cur, category_id)
    if not row:
        _introuvable()
    return AppointmentCategoryResponse(**row)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, current_user: dict = Depends(get_current_admin)):
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
            "SELECT COUNT(*) AS n FROM appointments WHERE categoryId = %s",
            (category_id,),
        )
        utilises = int(cur.fetchone()["n"])
    if utilises:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "inUse",
                "message": (
                    f"Impossible de supprimer : {utilises} rendez-vous "
                    f"{'utilisent' if utilises > 1 else 'utilise'} cette catégorie. "
                    "Reportez-les sur un autre avant de recommencer."
                ),
            },
        )
    with db_cursor(commit=True) as cur:
        cur.execute(f"DELETE FROM appointmentCategories WHERE id = %s", (category_id,))
        if cur.rowcount == 0:
            _introuvable()
