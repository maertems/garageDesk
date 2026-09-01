"""Journaux consultables depuis l'administration.

Trois sources, et elles ne se valent pas :

  * **notifications** et **synchro** viennent de `auditEvents`. Elles survivent aux
    déploiements et partent avec les sauvegardes vers l'instance de secours.
  * **actions** vient du fichier `actions.log`, écrit dans le conteneur. Il ne
    survit que si `/app/logs` est monté sur un volume — ce que fait `updateBack.sh`
    depuis cette version. Sans volume, il ne montre que depuis le dernier
    déploiement, et la route le dit dans sa réponse plutôt que de laisser croire à
    un historique complet.

Lecture seule, réservée aux administrateurs : ces journaux portent des adresses IP,
des identifiants d'utilisateur et des destinataires de notification.
"""

import json
import os

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_admin
from app.config import settings
from app.database import db_cursor
from app.schemas.common import CamelModel

router = APIRouter(prefix="/logs", tags=["logs"])

# Lecture par la fin : le fichier peut atteindre 10 Mo, et on n'affiche que les
# dernières entrées. Charger le tout pour en garder cinquante serait absurde.
_QUEUE_OCTETS = 512 * 1024


class LogEntry(CamelModel):
    id: int | None = None
    createdAt: str | None = None
    eventType: str | None = None
    entityId: int | None = None
    userId: int | None = None
    payload: dict | None = None


class ActionEntry(CamelModel):
    ts: str | None = None
    ip: str | None = None
    userId: int | None = None
    user: str | None = None
    action: str | None = None
    params: dict | None = None


class ActionsResponse(CamelModel):
    entries: list[ActionEntry]
    # Vrai quand le fichier est absent : soit rien n'a encore été journalisé, soit le
    # conteneur a été recréé sans volume et l'historique est parti avec.
    fileMissing: bool = False
    path: str


def _events(event_types: list[str], limit: int, only_failures: bool = False) -> list[LogEntry]:
    marques = ", ".join(["%s"] * len(event_types))
    conditions = [f"eventType IN ({marques})"]
    params: list = list(event_types)
    if only_failures:
        conditions.append("eventType LIKE %s")
        params.append("%Failed")
    params.append(limit)
    with db_cursor() as cur:
        cur.execute(
            f"""SELECT id, eventType, entityId, userId, payloadJson,
                       DATE_FORMAT(createdAt, '%%Y-%%m-%%dT%%H:%%i:%%S') AS createdAt
                FROM auditEvents
                WHERE {' AND '.join(conditions)}
                ORDER BY id DESC
                LIMIT %s""",
            params,
        )
        lignes = cur.fetchall()
    sorties: list[LogEntry] = []
    for l in lignes:
        charge = l.get("payloadJson")
        if isinstance(charge, str):
            try:
                charge = json.loads(charge)
            except Exception:
                charge = {"brut": charge}
        sorties.append(LogEntry(
            id=l["id"], createdAt=l.get("createdAt"), eventType=l.get("eventType"),
            entityId=l.get("entityId"), userId=l.get("userId"), payload=charge,
        ))
    return sorties


@router.get("/notifications", response_model=list[LogEntry],
            summary="Notifications envoyées et échouées")
def notifications_log(
    limit: int = Query(100, ge=1, le=500),
    onlyFailures: bool = Query(False),
    current_user: dict = Depends(get_current_admin),
):
    return _events(["notificationSent", "notificationFailed"], limit, onlyFailures)


@router.get("/sync", response_model=list[LogEntry],
            summary="Rapprochements et créations de la synchronisation")
def sync_log(
    limit: int = Query(100, ge=1, le=500),
    onlyFailures: bool = Query(False),
    current_user: dict = Depends(get_current_admin),
):
    return _events(["syncMatched", "syncCreated", "syncFailed"], limit, onlyFailures)


@router.get("/actions", response_model=ActionsResponse,
            summary="Journal des mutations de l'API")
def actions_log(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_admin),
):
    chemin = os.path.join(settings.logsDir, "actions.log")
    if not os.path.exists(chemin):
        return ActionsResponse(entries=[], fileMissing=True, path=chemin)

    with open(chemin, "rb") as f:
        f.seek(0, os.SEEK_END)
        taille = f.tell()
        f.seek(max(0, taille - _QUEUE_OCTETS))
        brut = f.read().decode("utf-8", "replace")

    lignes = brut.splitlines()
    # La première ligne peut être tronquée par le positionnement : on l'écarte dès
    # que la lecture n'a pas commencé au début du fichier.
    if taille > _QUEUE_OCTETS and lignes:
        lignes = lignes[1:]

    entrees: list[ActionEntry] = []
    for ligne in reversed(lignes):
        if len(entrees) >= limit:
            break
        ligne = ligne.strip()
        if not ligne:
            continue
        try:
            d = json.loads(ligne)
        except Exception:
            continue
        entrees.append(ActionEntry(
            ts=d.get("ts"), ip=d.get("ip"), userId=d.get("userId"),
            user=d.get("user"), action=d.get("action"), params=d.get("params"),
        ))
    return ActionsResponse(entries=entrees, fileMissing=False, path=chemin)
