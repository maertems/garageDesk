"""
Tâche planifiée : envoi des rappels de RDV à l'heure configurée (ex. 19h00).
Tourne dans le backend (thread qui vérifie chaque minute).

Désactivable par la variable d'environnement `SCHEDULER_ENABLED=0`, pour une
instance de secours : celle-ci tourne sur une restauration de la production et
enverrait sinon les mêmes rappels une seconde fois aux clients.
"""
import logging
import os
from datetime import date, datetime
import threading

from app.config import settings as app_settings
from app.services.notification_service import get_notification_settings, send_reminders

log = logging.getLogger(__name__)

_FALSY = {"0", "false", "no", "off", ""}


def reminders_enabled() -> bool:
    """Les rappels sont-ils autorisés sur cette instance ?

    Faux par défaut, **variable absente comprise** : il faut déclarer
    explicitement l'instance qui envoie. Un oubli suspend les rappels, ce qui se
    répare ; l'oubli inverse enverrait un second SMS à chaque client.

    L'environnement est relu à chaque appel plutôt que de s'en tenir à la valeur
    figée au démarrage : dans un conteneur cela revient au même, mais le point de
    décision est ainsi au bon endroit si la source du drapeau change un jour.
    """
    brut = os.environ.get("SCHEDULER_ENABLED")
    if brut is None:
        return bool(app_settings.schedulerEnabled)
    return brut.strip().lower() not in _FALSY


_last_reminder_run_date: date | None = None
_stop_event = threading.Event()


def _reminder_job() -> None:
    global _last_reminder_run_date
    # Contrôle à chaque réveil, et non une seule fois au démarrage : c'est le
    # dernier rempart avant l'envoi. Le thread n'est de toute façon pas lancé
    # quand les rappels sont désactivés, mais si un autre chemin de code
    # l'appelait, aucun rappel ne partirait pour autant.
    if not reminders_enabled():
        return
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
    """Démarre le thread qui envoie les rappels à l'heure configurée.

    Ne démarre rien si les rappels sont désactivés : un thread qui se réveille
    1 440 fois par jour pour ne rien faire serait du gaspillage, et la trace au
    démarrage dit plus clairement ce qui se passe qu'un silence.
    """
    global _thread
    if not reminders_enabled():
        # Message distinct selon l'absence ou le 0 explicite : sur une production
        # dont on aurait oublié la ligne, savoir que la variable manque évite de
        # chercher ailleurs.
        if os.environ.get("SCHEDULER_ENABLED") is None:
            log.warning(
                "Ordonnanceur des rappels DÉSACTIVÉ : la variable SCHEDULER_ENABLED "
                "n'est pas définie. Mettre SCHEDULER_ENABLED=1 dans deploy.env sur "
                "l'instance qui doit envoyer les rappels."
            )
        else:
            log.warning(
                "Ordonnanceur des rappels DÉSACTIVÉ sur cette instance "
                "(SCHEDULER_ENABLED=0) — aucun rappel de RDV ne sera envoyé d'ici."
            )
        return
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
