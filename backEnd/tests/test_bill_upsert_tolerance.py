"""Ce que la synchronisation extérieure doit accepter sans broncher.

Deux défauts signalés par l'exploitant, et tous deux rejetaient la facture
ENTIÈRE en 422 — le symptôme ne ressemblait donc pas à sa cause :

  * un document **sans voiture** : le script pousse `car` avec des champs vides,
    et `vm_id: Optional[int]` refusait la chaîne vide. On croyait à un véhicule
    mal rattaché ; en réalité le document n'entrait jamais ;
  * `time`, champ **polymorphe** dans la source — heures, quantité de pièces, ou
    unité de mesure en clair (« au metre ») — déclaré `Optional[float]`.

Aucune base ici : ce sont la validation d'entrée et les fonctions pures qui sont
éprouvées.
"""
import copy

import pytest

from app.routers.bills import (
    _detail_key,
    _time_equivalent_t1,
    _time_numerique,
    _voiture_exploitable,
)
from app.schemas.bill_upsert import UpsertBillPayload, UpsertCarInput, UpsertDetailInput

CHARGE = {
    "header": {
        "customer": {"vmId": 12, "firstName": "Amandine", "lastName": "Duverger"},
        "bill": {"billId": 9001, "docNum": 7, "type": "F", "status": "1"},
    },
    "detail": [{"type": "P", "reference": "REF", "description": "Filtre", "time": 1.0}],
}


def charge(**remplacements):
    c = copy.deepcopy(CHARGE)
    if "car" in remplacements:
        c["header"]["car"] = remplacements["car"]
    if "detail" in remplacements:
        c["detail"] = remplacements["detail"]
    return c


# ── Le document sans voiture ─────────────────────────────────────────────────

def test_voiture_aux_champs_vides_est_acceptee():
    """C'est la charge réelle du script : des chaînes vides, pas des clés absentes."""
    p = UpsertBillPayload(**charge(car={
        "vmId": "", "licensePlate": "", "brand": "", "model": "",
        "type": "", "vin": "", "registrationDate": "",
    }))
    assert p.header.car is not None
    assert p.header.car.vm_id is None, "la chaîne vide doit devenir None, non lever"


def test_client_sans_vmId_est_accepte():
    """Même défaut sur le client, et il aurait le même effet."""
    c = charge()
    c["header"]["customer"]["vmId"] = ""
    p = UpsertBillPayload(**c)
    assert p.header.customer.vm_id is None


@pytest.mark.parametrize("car, attendu", [
    (None, False),
    (UpsertCarInput(), False),
    (UpsertCarInput(vmId="", licensePlate="", brand=""), False),
    (UpsertCarInput(brand="Renault"), False),          # la marque seule ne distingue rien
    (UpsertCarInput(licensePlate="  "), False),        # blancs seuls
    (UpsertCarInput(vmId=88), True),
    (UpsertCarInput(licensePlate="AB-123-CD"), True),
    (UpsertCarInput(vin="VF1234567890"), True),
])
def test_voiture_exploitable(car, attendu):
    """`if car:` ne pouvait pas servir : un modèle Pydantic est toujours vrai.

    Sans ce contrôle, un véhicule VIDE était créé et rattaché à la facture.
    """
    assert _voiture_exploitable(car) is attendu


# ── Le champ `time`, polymorphe ──────────────────────────────────────────────

@pytest.mark.parametrize("entree, attendu", [
    (2.5, "2.5"),
    ("2.5", "2.5"),
    (3, "3"),
    ("au metre", "au metre"),
    ("", None),
    (None, None),
])
def test_time_accepte_nombres_et_texte(entree, attendu):
    assert UpsertDetailInput(time=entree).time == attendu


def test_charge_avec_time_textuel_est_acceptee():
    p = UpsertBillPayload(**charge(detail=[
        {"type": "P", "reference": "R1", "description": "Joint", "time": "au metre"},
    ]))
    assert p.detail[0].time == "au metre"


@pytest.mark.parametrize("entree, attendu", [
    ("1.50", 1.5), (1.5, 1.5), ("-32.00", -32.0),
    ("au metre", None), ("", None), (None, None), ("3 m", None),
])
def test_lecture_numerique_tolerante(entree, attendu):
    assert _time_numerique(entree) == attendu


def test_equivalent_t1_ignore_un_time_textuel():
    """Une ligne « au metre » n'a pas d'équivalent T1, et ne doit pas faire lever."""
    det = UpsertDetailInput(type="MI", time="au metre", priceHt=90.0)
    assert _time_equivalent_t1(det, 75.0) is None


def test_equivalent_t1_calcule_sur_un_time_numerique():
    det = UpsertDetailInput(type="MI", time="2", priceHt=75.0)
    assert _time_equivalent_t1(det, 75.0) == 2.0


# ── Le piège de la migration : ne pas dupliquer les 30 000 lignes ────────────

def test_la_cle_rapproche_1_50_et_1_5():
    """Le point à ne pas rater de la migration 029.

    MySQL convertit un FLOAT(5,2) en « 1.50 » — mesuré — alors que la source
    pousse `1.5`. Une clé textuelle aurait vu toutes les lignes existantes comme
    nouvelles et les aurait dupliquées à la première synchro.
    """
    en_base = _detail_key("REF", "Filtre", "1.50")
    poussee = _detail_key("REF", "Filtre", "1.5")
    assert en_base == poussee


def test_la_cle_distingue_deux_mentions_textuelles():
    assert _detail_key("R", "D", "au metre") != _detail_key("R", "D", "au kilo")


def test_la_cle_ne_confond_pas_texte_et_absence():
    assert _detail_key("R", "D", "au metre") != _detail_key("R", "D", None)
    assert _detail_key("R", "D", "") == _detail_key("R", "D", None), (
        "une chaîne vide et une absence désignent la même ligne"
    )


def test_la_cle_survit_a_un_time_hors_plafond_de_l_ancien_float():
    """FLOAT(5,2) plafonnait à 999,99 ; le texte lève la limite."""
    assert _detail_key("R", "D", "1500") == _detail_key("R", "D", "1500.00")
