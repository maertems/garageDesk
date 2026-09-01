"""Rapprochement des clients et véhicules poussés par le script extérieur.

Ces essais ne touchent AUCUNE base : le scoring est fait de fonctions pures, et la
résolution est exercée contre un curseur simulé. Ils tournent donc sans serveur
MySQL, contrairement aux essais d'API du même répertoire.

Ce qui est vérifié : la décision (rapprocher / créer) et les écritures (quels champs
complétés, lesquels préservés). Pas la validité SQL — celle-là se voit à l'exécution.
"""
import re

import pytest

from app.routers import bills
from app.schemas.bill_upsert import UpsertCarInput, UpsertCustomerInput
from app.services.matching import (
    MATCH,
    best_match,
    champs_a_completer,
    normalise,
    score_client,
    score_vehicle,
)


# ── Curseur simulé ───────────────────────────────────────────────────────────

class FakeCursor:
    """Reconnaît les quelques requêtes employées et sert des lignes en mémoire.

    Les UPDATE sont répercutés sur les lignes, comme le ferait la base : sans cela,
    un second rapprochement dans le même essai verrait encore les champs vides.
    """

    def __init__(self, clients=None, vehicles=None):
        self.clients = clients or []
        self.vehicles = vehicles or []
        self.writes = []       # (table, id, champs écrits)
        self.inserts = []      # (table, valeurs)
        self.audits = []
        self._result = []
        self.lastrowid = 999

    def execute(self, sql, params=()):
        flat = " ".join(sql.split())
        self._result = []

        if flat.startswith("SELECT") and "FROM clients" in flat:
            if "vmId = %s" in flat:
                self._result = [c for c in self.clients if c.get("vmId") == params[0]]
            elif "vmId IS NULL" in flat:
                self._result = [c for c in self.clients if c.get("vmId") is None]
        elif flat.startswith("SELECT") and "FROM vehicles" in flat:
            if "vmId = %s" in flat:
                self._result = [v for v in self.vehicles if v.get("vmId") == params[0]]
            elif "vmId IS NULL AND clientId <> %s" in flat:
                self._result = [v for v in self.vehicles
                                if v.get("vmId") is None and v.get("clientId") != params[0]]
            elif "clientId = %s" in flat:
                self._result = [v for v in self.vehicles if v.get("clientId") == params[0]]
        elif flat.startswith("UPDATE"):
            m = re.match(r"UPDATE (\w+) SET (.*?) WHERE id = %s", flat)
            table, champs = m.group(1), re.findall(r"`(\w+)` = %s", m.group(2))
            entity_id = params[-1]
            ecrits = dict(zip(champs, params[:-1]))
            self.writes.append((table, entity_id, ecrits))
            for ligne in (self.clients if table == "clients" else self.vehicles):
                if ligne["id"] == entity_id:
                    ligne.update(ecrits)
        elif "INSERT INTO auditEvents" in flat:
            self.audits.append(params)
        elif flat.startswith("INSERT INTO"):
            self.inserts.append((re.match(r"INSERT INTO (\w+)", flat).group(1), params))

    def fetchone(self):
        return self._result[0] if self._result else None

    def fetchall(self):
        return self._result


def local_client(**kw):
    base = {"id": 1, "vmId": None, "gender": None, "firstName": None, "lastName": None,
            "phone": None, "email": None, "address": None, "postalCode": None,
            "city": None, "vatNumber": None, "siren": None}
    base.update(kw)
    return base


def local_vehicle(**kw):
    base = {"id": 10, "clientId": 1, "vmId": None, "licensePlate": None, "brand": None,
            "vin": None, "type": None, "registrationDate": None}
    base.update(kw)
    return base


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Vroomly n'est jamais interrogé : la création de véhicule l'appelle."""
    monkeypatch.setattr(bills, "lookup_plate", lambda plate: {})


# ── Normalisation ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("brut,attendu", [
    ("Saint-Étienne", "saintetienne"),
    ("AB-123-CD", "ab123cd"),
    ("AB 123 CD", "ab123cd"),
    ("AB–123–CD", "ab123cd"),        # tiret cadratin, d'un copier-coller
    ("AB 123 CD", "ab123cd"),  # espace insécable
    ("AB.123.CD", "ab123cd"),
    ("  DUVERGER  ", "duverger"),
    ("O'Neill", "oneill"),
    ("Citroën", "citroen"),
    ("1234 AB 59", "1234ab59"),      # ancien format d'immatriculation
    (None, ""),
])
def test_normalise(brut, attendu):
    assert normalise(brut) == attendu


def test_plate_formats_all_match_each_other():
    formats = ["AB-123-CD", "AB 123 CD", "ab123cd", " AB-123-CD ", "AB.123.CD"]
    for a in formats:
        for b in formats:
            assert score_vehicle({"licensePlate": a}, {"licensePlate": b}) >= MATCH


# ── Score client ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("entrant,local,doit_rapprocher", [
    ({"lastName": "DUVERGER", "firstName": "Amandine", "city": "HAUBOURDIN"},
     {"lastName": "Duverger", "firstName": "amandine", "city": "Haubourdin"}, True),
    ({"lastName": "Duverger Martin", "firstName": "Jean-Luc", "city": "Lille"},
     {"lastName": "duverger-martin", "firstName": "jean luc", "city": "lille"}, True),
    # Faute de frappe tolérée
    ({"lastName": "Duverge", "firstName": "Amandine", "city": "Haubourdin"},
     {"lastName": "Duverger", "firstName": "Amandine", "city": "Haubourdin"}, True),
    # Homonyme de nom, prénom différent
    ({"lastName": "Dupont", "firstName": "Jean", "city": "Lille"},
     {"lastName": "Dupont", "firstName": "Marc", "city": "Lille"}, False),
    # Le verrou sur le nom : sans lui, prénom + ville suffiraient
    ({"lastName": "Martin", "firstName": "Jean", "city": "Lille"},
     {"lastName": "Dupont", "firstName": "Jean", "city": "Lille"}, False),
    # Déménagement : dupliqué, c'est le sens d'erreur retenu
    ({"lastName": "Dupont", "firstName": "Jean", "city": "Paris"},
     {"lastName": "Dupont", "firstName": "Jean", "city": "Lille"}, False),
    # Ville inconnue d'un côté : elle ne pèse pas
    ({"lastName": "Dupont", "firstName": "Jean", "city": "Paris"},
     {"lastName": "Dupont", "firstName": "Jean", "city": None}, True),
])
def test_score_client(entrant, local, doit_rapprocher):
    assert (score_client(entrant, local) >= MATCH) is doit_rapprocher


@pytest.mark.parametrize("entrant,local,doit_rapprocher", [
    # L'immatriculation décide seule, la marque ne fait que corroborer
    ({"licensePlate": "AB-123-CD", "brand": "Citroën"},
     {"licensePlate": "AB-123-CD", "brand": "Peugeot"}, True),
    ({"licensePlate": "AB-123-CD", "brand": "Peugeot"},
     {"licensePlate": "AB-123-CE", "brand": "Peugeot"}, False),
    ({"licensePlate": "XY-999-ZZ", "brand": "Renault"},
     {"licensePlate": "AB-123-CD", "brand": "Renault"}, False),
    ({"licensePlate": "AB-123-CD", "brand": "Renault"},
     {"licensePlate": None, "brand": "Renault"}, False),
])
def test_score_vehicle(entrant, local, doit_rapprocher):
    assert (score_vehicle(entrant, local) >= MATCH) is doit_rapprocher


def test_best_match_prefers_the_oldest_record():
    candidats = [{"id": 7, "lastName": "Dupont", "firstName": "Jean", "city": "Lille"},
                 {"id": 9, "lastName": "Dupont", "firstName": "Jean", "city": "Lille"}]
    trouve, _ = best_match({"lastName": "Dupont", "firstName": "Jean", "city": "Lille"},
                           candidats, score_client)
    assert trouve["id"] == 7


def test_completion_never_overwrites():
    local = {"vmId": None, "phone": "0611", "email": None, "city": "Lille"}
    entrant = {"vmId": 4242, "phone": "0699", "email": "a@b.fr", "city": "Paris"}
    a_completer = champs_a_completer(entrant, local, list(local))
    assert a_completer == {"vmId": 4242, "email": "a@b.fr"}


# ── Résolution ───────────────────────────────────────────────────────────────

def test_client_keyed_locally_then_pushed_is_merged():
    cur = FakeCursor(clients=[local_client(id=1, lastName="Duverger", firstName="Amandine",
                                          city="Haubourdin", phone="0611500721")])
    client_id, action = bills._resolve_customer(
        cur,
        UpsertCustomerInput(vmId=4242, lastName="DUVERGER", firstName="amandine",
                            city="HAUBOURDIN", phone="0699999999", email="a@b.fr"),
    )
    assert (action, client_id) == ("matched", 1)
    assert not cur.inserts, "aucune création ne doit avoir lieu"
    ecrits = cur.writes[0][2]
    assert ecrits["vmId"] == 4242, "l'ancrage doit être posé, sinon on re-rapproche à chaque envoi"
    assert ecrits["email"] == "a@b.fr"
    assert "phone" not in ecrits, "un téléphone déjà saisi ne doit pas être écrasé"
    assert len(cur.audits) == 1, "un rapprochement doit laisser une trace"


def test_second_push_takes_the_fast_path():
    cur = FakeCursor(clients=[local_client(id=1, vmId=4242, lastName="Duverger",
                                          firstName="Amandine", city="Haubourdin")])
    client_id, action = bills._resolve_customer(
        cur, UpsertCustomerInput(vmId=4242, lastName="DUVERGER", firstName="Amandine"))
    assert (action, client_id) == ("found", 1)


def test_namesake_in_another_town_is_created():
    cur = FakeCursor(clients=[local_client(id=1, lastName="Dupont", firstName="Jean",
                                          city="Lille")])
    _, action = bills._resolve_customer(
        cur, UpsertCustomerInput(vmId=7, lastName="Dupont", firstName="Jean", city="Paris"))
    assert action == "created"
    tables = [t for t, _ in cur.inserts]
    assert "clients" in tables
    assert "synchronization" in tables, "une création doit alimenter la file sortante"


def test_vehicle_merged_keeps_our_make():
    cur = FakeCursor(vehicles=[local_vehicle(id=10, clientId=1, licensePlate="AB-123-CD",
                                             brand="Peugeot")])
    vehicle_id, action = bills._resolve_vehicle(
        cur, 1, UpsertCarInput(vmId=88, licensePlate="ab123cd", brand="Citroën",
                               vin="VF31234567890123"))
    assert (action, vehicle_id) == ("matched", 10)
    ecrits = cur.writes[0][2]
    assert ecrits["vmId"] == 88
    assert ecrits["vin"] == "VF31234567890123"
    assert "brand" not in ecrits, "nos informations sont réputées plus fiables"


def test_vehicle_without_vmid_is_no_longer_skipped():
    cur = FakeCursor(vehicles=[local_vehicle(id=10, clientId=1, licensePlate="AB-123-CD",
                                             brand="Peugeot")])
    vehicle_id, action = bills._resolve_vehicle(
        cur, 1, UpsertCarInput(licensePlate="AB123CD", brand="Peugeot"))
    assert (action, vehicle_id) == ("matched", 10)


def test_unknown_plate_creates():
    cur = FakeCursor(vehicles=[local_vehicle(id=10, clientId=1, licensePlate="AB-123-CD")])
    _, action = bills._resolve_vehicle(cur, 1, UpsertCarInput(vmId=5, licensePlate="XY-999-ZZ"))
    assert action == "created"


def test_search_widens_beyond_the_resolved_client():
    cur = FakeCursor(vehicles=[local_vehicle(id=20, clientId=99, licensePlate="AB-123-CD")])
    vehicle_id, action = bills._resolve_vehicle(
        cur, 1, UpsertCarInput(vmId=5, licensePlate="AB-123-CD"))
    assert (action, vehicle_id) == ("matched", 20)
