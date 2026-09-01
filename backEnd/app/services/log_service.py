"""
Logging fichier pour les actions (mutations API) et les notifications.
Format : JSON lines (un objet JSON par ligne) avec rotation automatique.
Fichiers : <LOGS_DIR>/actions.log et <LOGS_DIR>/notifications.log
"""
import json
import logging
import os
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from fastapi import Request

_MAX_BYTES = 10 * 1024 * 1024  # 10 Mo
_BACKUP_COUNT = 5
_initialized = False

action_logger = logging.getLogger("garagedesk.actions")
notification_logger = logging.getLogger("garagedesk.notifications")


def _init_loggers() -> None:
    global _initialized
    if _initialized:
        return
    from app.config import settings
    logs_dir = settings.logsDir
    os.makedirs(logs_dir, exist_ok=True)

    fmt = logging.Formatter("%(message)s")

    for lg, filename in [
        (action_logger, "actions.log"),
        (notification_logger, "notifications.log"),
    ]:
        lg.setLevel(logging.INFO)
        lg.propagate = False
        if not lg.handlers:
            handler = RotatingFileHandler(
                os.path.join(logs_dir, filename),
                maxBytes=_MAX_BYTES,
                backupCount=_BACKUP_COUNT,
                encoding="utf-8",
            )
            handler.setFormatter(fmt)
            lg.addHandler(handler)

    _initialized = True


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def log_action(
    *,
    ip: str,
    user: dict | None,
    action: str,
    params: dict | None = None,
) -> None:
    _init_loggers()
    entry = {
        "ts": _now_iso(),
        "ip": ip,
        "userId": user["id"] if user else None,
        "user": user["login"] if user else None,
        "action": action,
        "params": params,
    }
    action_logger.info(json.dumps(entry, default=str, ensure_ascii=False))


def log_notification(
    *,
    triggered_by: str | None,
    client_id: int | None,
    recipient: str | None,
    notification_type: str,
    endpoint_type: str | None,
    success: bool,
    error_message: str | None = None,
    appointment_id: int | None = None,
) -> None:
    """Consigne une tentative d'envoi, dans le fichier ET dans auditEvents.

    Le fichier reste écrit pour le débogage immédiat, mais il vit dans le conteneur
    et disparaît à chaque déploiement : c'est la table qui porte l'historique
    consultable, et elle part avec les sauvegardes vers l'instance de secours.

    `auditEvents` plutôt qu'une table dédiée : elle existe, elle est en insertion
    seule, et son `payloadJson` accueille sans façon le destinataire, le canal et le
    message rendu par la passerelle.

    L'écriture en base ne doit jamais faire échouer un envoi qui a réussi, ni
    empêcher la création du rendez-vous : elle est donc enveloppée, et son échec ne
    laisse que le fichier.
    """
    _init_loggers()
    entry = {
        "ts": _now_iso(),
        "triggeredBy": triggered_by,
        "clientId": client_id,
        "recipient": recipient,
        "type": notification_type,
        "endpoint": endpoint_type,
        "success": success,
        "error": error_message,
    }
    notification_logger.info(json.dumps(entry, default=str, ensure_ascii=False))

    try:
        from app.database import db_cursor
        from app.services.audit_service import log_event

        with db_cursor(commit=True) as cur:
            log_event(
                cur,
                event_type="notificationSent" if success else "notificationFailed",
                entity_type="appointment",
                entity_id=appointment_id,
                payload={
                    "clientId": client_id,
                    # Destinataire tronqué : un journal consultable dans l'application
                    # n'a pas besoin du numéro complet pour dire à qui l'envoi était
                    # destiné, et il sera lu par d'autres que son destinataire.
                    "recipient": _masquer(recipient),
                    "endpoint": endpoint_type,
                    "type": notification_type,
                    "triggeredBy": triggered_by or "system",
                    "error": error_message,
                },
            )
    except Exception:
        # Base injoignable : le fichier a déjà la trace, et un envoi réussi ne doit
        # pas être rapporté comme un échec pour autant.
        pass


def _masquer(destinataire: str | None) -> str | None:
    """Garde de quoi reconnaître le destinataire sans l'exposer en entier.

    « 0611500721 » → « 061*****21 », « a.duverger@example.net » → « a.d***@example.net ».
    """
    if not destinataire:
        return destinataire
    if "@" in destinataire:
        locale, _, domaine = destinataire.partition("@")
        visible = locale[:3]
        return f"{visible}{'*' * max(1, len(locale) - 3)}@{domaine}"
    if len(destinataire) <= 5:
        return destinataire
    return f"{destinataire[:3]}{'*' * (len(destinataire) - 5)}{destinataire[-2:]}"
