"""Compte rendu d'une notification de création de rendez-vous.

`send_notification_on_create` rendait `None` : un échec était totalement muet, y
compris le cas le plus courant — aucun canal configuré. Elle rend désormais un
compte rendu dont `message` est la phrase à afficher, non nulle seulement s'il y a
lieu d'avertir.

Aucune base ici : les accès sont remplacés. Ce qui est vérifié, c'est la DÉCISION
d'avertir et le texte rendu.
"""
from contextlib import contextmanager

import pytest

from app.services import notification_service as ns


@contextmanager
def _faux_curseur(row):
    class C:
        def execute(self, *a, **k):
            pass

        def fetchone(self):
            return row

    yield C()


@pytest.fixture
def rdv_client(monkeypatch):
    """Un RDV client joignable par téléphone et par courriel."""
    monkeypatch.setattr(ns, "get_notification_settings", lambda: {
        "notificationOnCreate": True,
        "notificationMessageOnCreate": "Bonjour {prenom}, RDV le {date}.",
    })
    monkeypatch.setattr(ns, "db_cursor", lambda *a, **k: _faux_curseur({
        "startTime": None, "appointmentType": "client", "clientId": 7,
        "firstName": "Amandine", "lastName": "Duverger",
        "email": "a@example.net", "phone": "0611500721",
        "brand": "Renault", "model": "Clio",
    }))
    monkeypatch.setattr(ns, "log_notification", lambda **k: None)


def test_no_endpoint_configured_is_reported(monkeypatch, rdv_client):
    """Le cas le plus courant, et le plus silencieux jusqu'ici."""
    monkeypatch.setattr(ns, "get_endpoints", lambda: [])
    r = ns.send_notification_on_create(1)
    assert r["sent"] == 0
    assert "Aucun canal" in r["message"]


def test_all_sent_produces_no_warning(monkeypatch, rdv_client):
    monkeypatch.setattr(ns, "get_endpoints", lambda: [
        {"type": "sms", "baseUrl": "http://x"}, {"type": "email", "baseUrl": "http://y"}])
    monkeypatch.setattr(ns, "_send_to_endpoint", lambda *a: (True, None))
    r = ns.send_notification_on_create(1)
    assert (r["sent"], r["failed"]) == (2, 0)
    assert r["message"] is None, "aucun avertissement quand tout est parti"


def test_gateway_failure_is_reported_with_its_message(monkeypatch, rdv_client):
    monkeypatch.setattr(ns, "get_endpoints", lambda: [{"type": "sms", "baseUrl": "http://x"}])
    monkeypatch.setattr(ns, "_send_to_endpoint", lambda *a: (False, "Connection refused"))
    r = ns.send_notification_on_create(1)
    assert r["failed"] == 1
    assert "Connection refused" in r["message"]
    assert "sms" in r["message"]


def test_partial_send_still_warns(monkeypatch, rdv_client):
    """Deux canaux, un seul parti : le client n'est prévenu qu'à moitié."""
    monkeypatch.setattr(ns, "get_endpoints", lambda: [
        {"type": "sms", "baseUrl": "http://x"}, {"type": "email", "baseUrl": "http://y"}])
    appels = {"n": 0}

    def envoi(*a):
        appels["n"] += 1
        return (True, None) if appels["n"] == 1 else (False, "500")
    monkeypatch.setattr(ns, "_send_to_endpoint", envoi)
    r = ns.send_notification_on_create(1)
    assert (r["sent"], r["failed"]) == (1, 1)
    assert r["message"] is not None


def test_client_without_phone_is_reported(monkeypatch):
    """Motif fréquent et invisible jusqu'ici : le client n'a pas de téléphone."""
    monkeypatch.setattr(ns, "get_notification_settings", lambda: {
        "notificationOnCreate": True, "notificationMessageOnCreate": "Bonjour."})
    monkeypatch.setattr(ns, "db_cursor", lambda *a, **k: _faux_curseur({
        "startTime": None, "appointmentType": "client", "clientId": 7,
        "firstName": "Jean", "lastName": "Dupont", "email": "", "phone": "",
        "brand": None, "model": None,
    }))
    traces = []
    monkeypatch.setattr(ns, "log_notification", lambda **k: traces.append(k))
    monkeypatch.setattr(ns, "get_endpoints", lambda: [{"type": "sms", "baseUrl": "http://x"}])
    r = ns.send_notification_on_create(1)
    assert r["sent"] == 0 and r["skipped"] == 1
    assert "téléphone" in r["message"]
    assert traces and traces[0]["success"] is False, "le canal sauté doit être consigné"
    assert traces[0]["appointment_id"] == 1


def test_disabled_setting_warns_nobody(monkeypatch, rdv_client):
    """Notification désactivée dans les réglages : ce n'est pas un incident."""
    monkeypatch.setattr(ns, "get_notification_settings", lambda: {
        "notificationOnCreate": False, "notificationMessageOnCreate": ""})
    r = ns.send_notification_on_create(1)
    assert r["message"] is None


def test_non_client_appointment_warns_nobody(monkeypatch, rdv_client):
    monkeypatch.setattr(ns, "get_endpoints", lambda: [{"type": "sms", "baseUrl": "http://x"}])
    monkeypatch.setattr(ns, "db_cursor", lambda *a, **k: _faux_curseur({
        "startTime": None, "appointmentType": "internal", "clientId": None,
        "firstName": None, "lastName": None, "email": "", "phone": "",
        "brand": None, "model": None,
    }))
    r = ns.send_notification_on_create(1)
    assert r["message"] is None
