"""
Tâche planifiée : envoi des rappels de RDV à l'heure configurée (ex. 19h00).
Tourne dans le backend (thread qui vérifie chaque minute).
"""
from datetime import date, datetime
import threading

from app.services.notification_service import get_notification_settings, send_reminders


_last_reminder_run_date: date | None = None
_stop_event = threading.Event()


def _reminder_job() -> None:
    global _last_reminder_run_date
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    today = now.date()
    try:
        settings = get_notification_settings()
        reminder_time = (settings.get("notificationReminderTime") or "19:00").strip()
        if not reminder_time:
            reminder_time = "19:00"
        if current_time == reminder_time and _last_reminder_run_date != today:
            send_reminders()
            _last_reminder_run_date = today
    except Exception:
        pass


def _scheduler_loop() -> None:
    while not _stop_event.is_set():
        # Attendre 1 minute (ou jusqu'à stop), puis exécuter le job
        if _stop_event.wait(timeout=60):
            break
        _reminder_job()


_thread: threading.Thread | None = None


def start_scheduler() -> None:
    """Démarre le thread qui envoie les rappels à l'heure configurée."""
    global _thread
    if _thread is not None:
        return
    _thread = threading.Thread(target=_scheduler_loop, daemon=True)
    _thread.start()


def stop_scheduler() -> None:
    """Arrête le thread (pour tests ou arrêt propre)."""
    global _thread
    _stop_event.set()
    if _thread is not None:
        _thread.join(timeout=65)
    _thread = None
