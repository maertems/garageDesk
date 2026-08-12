from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user, get_current_admin
from app.schemas.notification import (
    NotificationEndpointCreate,
    NotificationEndpointUpdate,
    NotificationEndpointResponse,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
)
from app.services.notification_service import (
    get_notification_settings,
    NOTIFICATION_ON_CREATE_KEY,
    NOTIFICATION_REMINDER_DAYS_KEY,
    NOTIFICATION_REMINDER_TIME_KEY,
    NOTIFICATION_MESSAGE_ON_CREATE_KEY,
    NOTIFICATION_MESSAGE_REMINDER_KEY,
    send_reminders,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _settings_to_response(settings: dict) -> NotificationSettingsResponse:
    return NotificationSettingsResponse(
        notificationOnCreate=settings["notificationOnCreate"],
        notificationReminderDaysBefore=settings["notificationReminderDaysBefore"],
        notificationReminderTime=settings["notificationReminderTime"],
        notificationMessageOnCreate=settings["notificationMessageOnCreate"],
        notificationMessageReminder=settings["notificationMessageReminder"],
    )


def _upsert_setting(key: str, value: str) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO settings (`key`, value) VALUES (%s, %s) ON DUPLICATE KEY UPDATE value = VALUES(value)",
            (key, value),
        )


# ---------- Endpoints (CRUD) ----------


@router.get("/endpoints", response_model=list[NotificationEndpointResponse])
def list_endpoints(current_user: dict = Depends(get_current_admin)):
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, type, baseUrl, sortOrder, active FROM notificationEndpoints ORDER BY sortOrder, id"
        )
        rows = cur.fetchall()
    def _row_with_bool_active(r):
        d = dict(r)
        d["active"] = bool(d.get("active", 1))
        return NotificationEndpointResponse(**d)
    return [_row_with_bool_active(r) for r in rows]


@router.post("/endpoints", response_model=NotificationEndpointResponse, status_code=201)
def create_endpoint(data: NotificationEndpointCreate, current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO notificationEndpoints (type, baseUrl, sortOrder, active) VALUES (%s, %s, %s, %s)",
            (data.type, data.base_url, data.sort_order, 1 if data.active else 0),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        eid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, type, baseUrl, sortOrder, active FROM notificationEndpoints WHERE id = %s",
            (eid,),
        )
        row = cur.fetchone()
    if row is not None:
        row = dict(row)
        row["active"] = bool(row.get("active", 1))
    return NotificationEndpointResponse(**row)


@router.patch("/endpoints/{endpoint_id}", response_model=NotificationEndpointResponse)
def update_endpoint(
    endpoint_id: int,
    data: NotificationEndpointUpdate,
    current_user: dict = Depends(get_current_admin),
):
    updates = data.model_dump(exclude_unset=True, by_alias=True)
    if not updates:
        with db_cursor() as cur:
            cur.execute(
                "SELECT id, type, baseUrl, sortOrder, active FROM notificationEndpoints WHERE id = %s",
                (endpoint_id,),
            )
            row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Endpoint not found"})
        return NotificationEndpointResponse(**row)
    # Mapping camelCase schema -> DB columns
    col_map = {"baseUrl": "baseUrl", "sortOrder": "sortOrder", "type": "type", "active": "active"}
    set_parts = []
    values = []
    for k, v in updates.items():
        col = col_map.get(k, k)
        set_parts.append(f"`{col}` = %s")
        if col == "active" and isinstance(v, bool):
            v = 1 if v else 0
        values.append(v)
    values.append(endpoint_id)
    with db_cursor(commit=True) as cur:
        cur.execute(
            f"UPDATE notificationEndpoints SET {', '.join(set_parts)} WHERE id = %s",
            tuple(values),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Endpoint not found"})
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, type, baseUrl, sortOrder, active FROM notificationEndpoints WHERE id = %s",
            (endpoint_id,),
        )
        row = cur.fetchone()
    # Convertir active (0/1) en bool pour Pydantic
    if row is not None and "active" in row:
        row = dict(row)
        row["active"] = bool(row["active"])
    return NotificationEndpointResponse(**row)


@router.delete("/endpoints/{endpoint_id}", status_code=204)
def delete_endpoint(endpoint_id: int, current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM notificationEndpoints WHERE id = %s", (endpoint_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Endpoint not found"})


# ---------- Paramètres notification ----------


@router.get("/settings", response_model=NotificationSettingsResponse)
def get_settings(current_user: dict = Depends(get_current_admin)):
    settings = get_notification_settings()
    return _settings_to_response(settings)


@router.patch("/settings", response_model=NotificationSettingsResponse)
def update_settings(
    data: NotificationSettingsUpdate,
    current_user: dict = Depends(get_current_admin),
):
    updates = data.model_dump(exclude_unset=True, by_alias=True)
    key_map = {
        "notificationOnCreate": NOTIFICATION_ON_CREATE_KEY,
        "notificationReminderDaysBefore": NOTIFICATION_REMINDER_DAYS_KEY,
        "notificationReminderTime": NOTIFICATION_REMINDER_TIME_KEY,
        "notificationMessageOnCreate": NOTIFICATION_MESSAGE_ON_CREATE_KEY,
        "notificationMessageReminder": NOTIFICATION_MESSAGE_REMINDER_KEY,
    }
    for schema_key, db_key in key_map.items():
        if schema_key in updates:
            v = updates[schema_key]
            if isinstance(v, bool):
                v = "1" if v else "0"
            else:
                v = str(v) if v is not None else ""
            _upsert_setting(db_key, v)
    settings = get_notification_settings()
    return _settings_to_response(settings)


# ---------- Déclencher l'envoi des rappels (appelé par le scheduler ou manuellement) ----------


@router.post("/send-reminders")
def trigger_send_reminders(current_user: dict = Depends(get_current_admin)):
    """Envoie les rappels pour les RDV dans N jours. Utilisé par le cron/scheduler ou manuellement."""
    count = send_reminders()
    return {"sentCount": count}
