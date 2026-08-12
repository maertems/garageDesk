"""
Envoi de notifications (création RDV, rappels) vers des APIs externes.
Contrat: POST <baseUrl>/send avec { "destinataire": "...", "message": "..." }.
Les heures affichées dans les messages sont en heure locale (config DISPLAY_TIMEZONE, défaut Europe/Paris).
"""
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from app.config import settings
from app.database import db_cursor
from app.services.log_service import log_notification

logger = logging.getLogger(__name__)


# Clés des paramètres dans la table settings
NOTIFICATION_ON_CREATE_KEY = "notificationOnCreate"
NOTIFICATION_REMINDER_DAYS_KEY = "notificationReminderDaysBefore"
NOTIFICATION_REMINDER_TIME_KEY = "notificationReminderTime"
NOTIFICATION_MESSAGE_ON_CREATE_KEY = "notificationMessageOnCreate"
NOTIFICATION_MESSAGE_REMINDER_KEY = "notificationMessageReminder"

DEFAULT_MESSAGE_CREATE = "Bonjour #PRENOM# #NOM#, votre rendez-vous est prévu le #JOUR#/#MOIS#/#YEAR# à #HEURE#. Véhicule: #MARQUE# #MODELE#."
DEFAULT_MESSAGE_REMINDER = "Rappel: rendez-vous le #JOUR#/#MOIS#/#YEAR# à #HEURE#. Véhicule: #MARQUE# #MODELE#."


def _get_setting(key: str, default: str = "") -> str:
    with db_cursor() as cur:
        cur.execute("SELECT value FROM settings WHERE `key` = %s", (key,))
        row = cur.fetchone()
    return (row["value"] or default) if row else default


def get_notification_settings() -> dict[str, Any]:
    on_create = _get_setting(NOTIFICATION_ON_CREATE_KEY, "0").lower() in ("1", "true", "yes")
    days = _get_setting(NOTIFICATION_REMINDER_DAYS_KEY, "1")
    try:
        days_int = int(days)
    except ValueError:
        days_int = 1
    time_str = _get_setting(NOTIFICATION_REMINDER_TIME_KEY, "19:00")
    msg_create = _get_setting(NOTIFICATION_MESSAGE_ON_CREATE_KEY, DEFAULT_MESSAGE_CREATE)
    msg_reminder = _get_setting(NOTIFICATION_MESSAGE_REMINDER_KEY, DEFAULT_MESSAGE_REMINDER)
    return {
        "notificationOnCreate": on_create,
        "notificationReminderDaysBefore": days_int,
        "notificationReminderTime": time_str,
        "notificationMessageOnCreate": msg_create,
        "notificationMessageReminder": msg_reminder,
    }


def _replace_keywords(template: str, context: dict[str, str]) -> str:
    out = template
    for k, v in context.items():
        out = out.replace(k, v or "")
    return out


def _utc_to_local(dt: datetime) -> datetime:
    """Convertit un datetime (naive UTC ou timezone-aware) en heure locale pour les notifications."""
    if dt.tzinfo is not None:
        utc_dt = dt.astimezone(timezone.utc)
    else:
        utc_dt = dt.replace(tzinfo=timezone.utc)
    try:
        tz = ZoneInfo(settings.displayTimezone)
    except Exception:
        tz = ZoneInfo("Europe/Paris")
    return utc_dt.astimezone(tz)


def build_message_context(
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    appointment_start: datetime | None = None,
    brand: str | None = None,
    model: str | None = None,
) -> dict[str, str]:
    """Construit le dictionnaire de mots-clés pour le remplacement. Les dates/heures sont en heure locale."""
    if appointment_start:
        local_dt = _utc_to_local(appointment_start)
        day = local_dt.strftime("%d")
        month = local_dt.strftime("%m")
        year = local_dt.strftime("%Y")
        hour = local_dt.strftime("%H:%M")
    else:
        day = month = year = hour = ""
    return {
        "#NOM#": last_name or "",
        "#PRENOM#": first_name or "",
        "#JOUR#": day,
        "#MOIS#": month,
        "#YEAR#": year,
        "#HEURE#": hour,
        "#MARQUE#": brand or "",
        "#MODELE#": model or "",
    }


def get_endpoints(active_only: bool = True) -> list[dict]:
    """Liste les canaux. active_only=True : uniquement les actifs (pour envoi)."""
    with db_cursor() as cur:
        if active_only:
            cur.execute(
                "SELECT id, type, baseUrl, sortOrder FROM notificationEndpoints WHERE active = 1 ORDER BY sortOrder, id"
            )
        else:
            cur.execute(
                "SELECT id, type, baseUrl, sortOrder, active FROM notificationEndpoints ORDER BY sortOrder, id"
            )
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def _send_to_endpoint(base_url: str, destinataire: str, message: str) -> tuple[bool, str | None]:
    """POST <baseUrl>/send avec { destinataire, message }. Retourne (success, error_message).
    En cas de redirection (301/302), on réenvoie un POST vers la nouvelle URL pour éviter que urllib ne transforme en GET."""
    url = base_url.rstrip("/") + "/send"
    data = json.dumps({"destinataire": destinataire, "message": message}).encode("utf-8")
    max_redirects = 5
    last_exc = None
    for _ in range(max_redirects):
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            logger.warning("Notification: POST %s (destinataire=%s)", url, destinataire[:3] + "***" if len(destinataire) > 3 else destinataire)
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp.read()
            logger.warning("Notification: OK %s", url)
            return (True, None)
        except urllib.error.HTTPError as e:
            # Redirection : réenvoyer un POST vers la cible (urllib suit en GET par défaut)
            if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location"):
                location = e.headers.get("Location")
                url = location if location.startswith("http") else urllib.parse.urljoin(url, location)
                logger.warning("Notification: redirection %s -> POST %s", e.code, url)
                continue
            last_exc = e
            break
        except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
            last_exc = e
            break
    logger.warning("Notification: échec %s: %s", url, last_exc)
    return (False, str(last_exc))


def send_notification_on_create(appointment_id: int, triggered_by: str | None = None) -> None:
    """
    Envoie les notifications « création de RDV » pour un rendez-vous client.
    Appelé après création du RDV si notificationOnCreate est activé.
    """
    settings = get_notification_settings()
    if not settings["notificationOnCreate"]:
        logger.warning("Notification création RDV %s: désactivée (paramètre notificationOnCreate)", appointment_id)
        return
    endpoints = get_endpoints()
    if not endpoints:
        logger.warning("Notification création RDV %s: aucun canal d'envoi configuré (Admin > Notifications)", appointment_id)
        return
    logger.warning("Notification création: RDV id=%s, envoi vers %s canal(aux)", appointment_id, len(endpoints))
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT a.startTime, a.appointmentType, a.clientId,
                   c.firstName, c.lastName, c.email, c.phone,
                   v.brand, v.model
            FROM appointments a
            LEFT JOIN clients c ON c.id = a.clientId
            LEFT JOIN vehicles v ON v.id = a.vehicleId
            WHERE a.id = %s
            """,
            (appointment_id,),
        )
        row = cur.fetchone()
    if not row or row["appointmentType"] != "client":
        logger.warning("Notification création RDV %s: RDV non client ou introuvable", appointment_id)
        return
    template = settings["notificationMessageOnCreate"] or DEFAULT_MESSAGE_CREATE
    context = build_message_context(
        first_name=row.get("firstName"),
        last_name=row.get("lastName"),
        appointment_start=row.get("startTime"),
        brand=row.get("brand"),
        model=row.get("model"),
    )
    message = _replace_keywords(template, context)
    # Clés possibles selon MySQL/PyMySQL (casse)
    email_val = (row.get("email") or row.get("Email") or "").strip()
    phone_val = (row.get("phone") or row.get("Phone") or "").strip()
    client_id = row.get("clientId")
    for ep in endpoints:
        ep_type = ep["type"]
        base_url = ep["baseUrl"]
        if ep_type == "email":
            destinataire = email_val
        else:
            destinataire = phone_val
        if not destinataire:
            logger.warning(
                "Notification création RDV %s: canal %s ignoré (client sans %s)",
                appointment_id, ep_type, "email" if ep_type == "email" else "téléphone"
            )
            continue
        success, error = _send_to_endpoint(base_url, destinataire, message)
        log_notification(
            triggered_by=triggered_by or "system",
            client_id=client_id,
            recipient=destinataire,
            notification_type="onCreate",
            endpoint_type=ep_type,
            success=success,
            error_message=error,
        )


def get_appointments_for_reminder() -> list[dict]:
    """
    Retourne les RDV clients dont la date est dans exactement N jours (N = notificationReminderDaysBefore),
    pour envoi du rappel à l'heure configurée.
    """
    settings = get_notification_settings()
    days = settings["notificationReminderDaysBefore"]
    # Date cible = aujourd'hui + days (en date seule, pas d'heure)
    from datetime import date, timedelta
    target_date = date.today() + timedelta(days=days)
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.startTime, a.appointmentType,
                   c.firstName, c.lastName, c.email, c.phone,
                   v.brand, v.model
            FROM appointments a
            LEFT JOIN clients c ON c.id = a.clientId
            LEFT JOIN vehicles v ON v.id = a.vehicleId
            WHERE a.appointmentType = 'client'
              AND a.clientId IS NOT NULL
              AND DATE(a.startTime) = %s
            ORDER BY a.startTime
            """,
            (target_date,),
        )
        return [dict(r) for r in cur.fetchall()]


def send_reminders(triggered_by: str = "scheduler") -> int:
    """
    Envoie les rappels pour les RDV dans N jours.
    Retourne le nombre de RDV pour lesquels au moins un envoi a été tenté.
    """
    endpoints = get_endpoints()
    if not endpoints:
        return 0
    settings = get_notification_settings()
    template = settings["notificationMessageReminder"] or DEFAULT_MESSAGE_REMINDER
    appointments = get_appointments_for_reminder()
    count = 0
    for apt in appointments:
        context = build_message_context(
            first_name=apt.get("firstName"),
            last_name=apt.get("lastName"),
            appointment_start=apt.get("startTime"),
            brand=apt.get("brand"),
            model=apt.get("model"),
        )
        message = _replace_keywords(template, context)
        email_val = (apt.get("email") or apt.get("Email") or "").strip()
        phone_val = (apt.get("phone") or apt.get("Phone") or "").strip()
        client_id = apt.get("clientId") or apt.get("id")
        sent_any = False
        for ep in endpoints:
            ep_type = ep["type"]
            base_url = ep["baseUrl"]
            if ep_type == "email":
                destinataire = email_val
            else:
                destinataire = phone_val
            if not destinataire:
                continue
            success, error = _send_to_endpoint(base_url, destinataire, message)
            log_notification(
                triggered_by=triggered_by,
                client_id=apt.get("clientId"),
                recipient=destinataire,
                notification_type="reminder",
                endpoint_type=ep_type,
                success=success,
                error_message=error,
            )
            if success:
                sent_any = True
        if sent_any:
            count += 1
    return count
