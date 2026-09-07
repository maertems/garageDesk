"""Ce que le RAPPEL automatique consigne — et surtout ce qu'il taisait.

Le compte rendu de `send_notification_on_create` est éprouvé à côté
(`test_notification_outcome.py`). Le rappel, lui, n'a AUCUNE interface pour
avertir : il part à 19 h, personne n'est devant l'écran. La trace en base est donc
son seul recours, et c'est ce qui est vérifié ici.

Quatre silences existaient, tous mesurés avant correction :

  * aucun canal configuré → `return 0` sans un mot, alors que c'est le motif le
    plus fréquent ;
  * client sans téléphone ni courriel → `continue` nu ;
  * `appointment_id` jamais transmis → `entityId` nul, l'échec n'était rattachable
    à aucun rendez-vous ;
  * `clientId` toujours nul — la valeur était calculée puis jamais utilisée, et le
    `SELECT` ne la récupérait même pas.

Aucune base ici : les accès sont remplacés. Ce qui est vérifié, ce sont les TRACES.
"""
import pytest

from app.services import notification_service as ns

RDV = {
    "id": 42,
    "clientId": 7,
    "startTime": None,
    "appointmentType": "client",
    "firstName": "Amandine",
    "lastName": "Duverger",
    "email": "a@example.net",
    "phone": "0611500721",
    "brand": "Renault",
    "model": "Clio",
}

SMS = [{"type": "sms", "baseUrl": "http://x"}]
SMS_ET_EMAIL = [{"type": "sms", "baseUrl": "http://x"}, {"type": "email", "baseUrl": "http://y"}]


@pytest.fixture
def traces(monkeypatch):
    """Recueille les appels à `log_notification` au lieu de les écrire."""
    recueil: list[dict] = []
    monkeypatch.setattr(ns, "log_notification", lambda **k: recueil.append(k))
    monkeypatch.setattr(ns, "get_notification_settings", lambda: {
        "notificationReminderDaysBefore": 1,
        "notificationReminderTime": "19:00",
        "notificationMessageReminder": "Rappel #JOUR#/#MOIS# à #HEURE#",
    })
    monkeypatch.setattr(ns, "get_appointments_for_reminder", lambda: [dict(RDV)])
    monkeypatch.setattr(ns, "_send_to_endpoint", lambda *a: (True, None))
    return recueil


def test_aucun_canal_configure_laisse_une_trace(monkeypatch, traces):
    """Le motif le plus fréquent, et le plus silencieux jusqu'ici."""
    monkeypatch.setattr(ns, "get_endpoints", lambda *a, **k: [])
    assert ns.send_reminders() == 0
    assert len(traces) == 1, "un rappel qui ne part pas doit se voir"
    t = traces[0]
    assert t["success"] is False
    assert "aucun canal" in t["error_message"]
    assert t["notification_type"] == "reminder"


def test_client_sans_coordonnees_est_consigne_par_canal(monkeypatch, traces):
    """Cause la plus fréquente d'un rappel qui « ne marche pas »."""
    monkeypatch.setattr(ns, "get_endpoints", lambda *a, **k: SMS_ET_EMAIL)
    monkeypatch.setattr(ns, "get_appointments_for_reminder",
                        lambda: [{**RDV, "email": "", "phone": ""}])
    assert ns.send_reminders() == 0
    assert len(traces) == 2, "une trace par canal sauté"
    motifs = {t["error_message"] for t in traces}
    assert motifs == {"client sans téléphone", "client sans email"}
    for t in traces:
        assert t["success"] is False
        # Rattachable : sans ces deux valeurs, on sait qu'un envoi a échoué mais
        # pas pour qui.
        assert t["appointment_id"] == 42
        assert t["client_id"] == 7


def test_echec_de_passerelle_porte_son_message(monkeypatch, traces):
    monkeypatch.setattr(ns, "get_endpoints", lambda *a, **k: SMS)
    monkeypatch.setattr(ns, "_send_to_endpoint", lambda *a: (False, "Connection refused"))
    assert ns.send_reminders() == 0
    assert len(traces) == 1
    assert traces[0]["error_message"] == "Connection refused"
    assert traces[0]["appointment_id"] == 42


def test_envoi_reussi_est_rattachable(monkeypatch, traces):
    """Un succès aussi doit dire de quel rendez-vous il s'agit."""
    monkeypatch.setattr(ns, "get_endpoints", lambda *a, **k: SMS)
    assert ns.send_reminders() == 1
    assert len(traces) == 1
    t = traces[0]
    assert (t["success"], t["appointment_id"], t["client_id"]) == (True, 42, 7)


def test_le_client_du_rappel_vient_de_la_requete(monkeypatch, traces):
    """`clientId` était calculé puis jamais utilisé, et absent du SELECT.

    Le garde-fou porte sur la conséquence : une trace de rappel dont le client est
    nul ne permet plus de savoir qui n'a pas été prévenu.
    """
    monkeypatch.setattr(ns, "get_endpoints", lambda *a, **k: SMS)
    ns.send_reminders()
    assert traces[0]["client_id"] == 7, "le client doit être repris de la requête"


def test_le_select_recupere_bien_clientId():
    """Sans `a.clientId` dans le SELECT, le test précédent passerait à faux.

    Il ne vérifierait que le jeu d'essai, qui pose la clé lui-même. On lit donc la
    requête : c'est elle qui doit la fournir en production.

    Et on lit la LISTE DU SELECT, pas la fonction entière : le `WHERE` porte déjà
    `a.clientId IS NOT NULL` depuis toujours, si bien qu'un simple « `a.clientId`
    est présent quelque part » passait avant comme après la correction. Le garde-fou
    ne gardait rien.
    """
    import inspect
    source = inspect.getsource(ns.get_appointments_for_reminder)
    debut = source.index("SELECT")
    liste_select = source[debut:source.index("FROM", debut)]
    assert "a.clientId" in liste_select, (
        "le SELECT doit rendre clientId, sinon la trace ne dit pas qui n'a pas "
        f"été prévenu. Liste actuelle : {liste_select.strip()!r}"
    )


def test_exception_de_la_tache_planifiee_est_visible(monkeypatch):
    """Le silence le plus coûteux : l'envoi ne se déclenche que dans la fenêtre
    d'UNE minute, donc une exception faisait sauter la journée entière sans trace.
    """
    from datetime import datetime

    from app import scheduler as sch

    recueil: list[dict] = []
    monkeypatch.setattr("app.services.log_service.log_notification",
                        lambda **k: recueil.append(k))
    monkeypatch.setattr(sch, "reminders_enabled", lambda: True)
    monkeypatch.setattr(sch, "get_notification_settings",
                        lambda: {"notificationReminderTime": "19:00"})

    def leve():
        raise RuntimeError("MySQL injoignable")

    monkeypatch.setattr(sch, "send_reminders", leve)

    class FauxDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 9, 7, 19, 0, 0)

    monkeypatch.setattr(sch, "datetime", FauxDatetime)
    monkeypatch.setattr(sch, "_last_reminder_run_date", None)

    sch._reminder_job()  # ne doit pas lever : le thread doit survivre

    assert len(recueil) == 1, "l'échec de la tâche doit laisser une trace consultable"
    assert "MySQL injoignable" in recueil[0]["error_message"]
    assert recueil[0]["success"] is False
    # Non positionné : si le réveil suivant retombe dans la même minute, une
    # seconde tentative a lieu plutôt qu'un abandon pour la journée.
    assert sch._last_reminder_run_date is None
