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
) -> None:
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
