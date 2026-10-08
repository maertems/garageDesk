"""Garde-fous des référentiels de rendez-vous : états et catégories.

Les deux routeurs sont écrits sur le même modèle et doivent se comporter
pareil — d'où le paramétrage, qui empêche l'un de dériver de l'autre.

Trois règles à tenir :

  * **l'écriture est réservée aux administrateurs.** Les routes utilisaient
    `get_current_user` : n'importe quel utilisateur connecté pouvait créer ou
    supprimer un état par appel direct, alors même que l'écran est protégé ;
  * **la suppression est refusée tant que des rendez-vous s'y rattachent.** La
    base ne porte aucune contrainte de clé étrangère (règle du projet) : rien
    n'empêcherait la ligne de partir en laissant des rendez-vous pointer dans le
    vide, qui perdraient couleur et libellé sans que personne ne l'apprenne ;
  * **le code reste unique.** Il identifie l'entrée partout ailleurs — et il est
    employé en dur : `AppointmentForm` cherche `mechanic` pour la catégorie par
    défaut.

Pas de base : les dépendances sont lues sur les routes elles-mêmes, et le reste
par inspection du source. C'est partiel et assumé — mais c'est ce qui aurait
attrapé le défaut d'origine.
"""
import inspect

import pytest

from app.auth import get_current_admin, get_current_user
from app.routers import appointment_categories, appointment_statuses

MODULES = [
    pytest.param(appointment_statuses, "statusId", id="états"),
    pytest.param(appointment_categories, "categoryId", id="catégories"),
]


def _route(module, methode: str):
    for r in module.router.routes:
        if methode in r.methods:
            return r
    raise AssertionError(f"{module.__name__} : aucune route {methode}")


def _dependances(route) -> set:
    return {d.call for d in route.dependant.dependencies}


@pytest.mark.parametrize("module, colonne", MODULES)
@pytest.mark.parametrize("methode", ["POST", "PATCH", "DELETE"])
def test_ecriture_reservee_aux_administrateurs(module, colonne, methode):
    assert get_current_admin in _dependances(_route(module, methode)), (
        f"{methode} doit exiger un administrateur : l'écran est protégé, "
        "l'API doit l'être aussi"
    )


@pytest.mark.parametrize("module, colonne", MODULES)
def test_lecture_ouverte_a_tout_utilisateur_connecte(module, colonne):
    """La liste alimente le calendrier et les formulaires : tout le monde la lit."""
    deps = _dependances(_route(module, "GET"))
    assert get_current_user in deps
    assert get_current_admin not in deps


@pytest.mark.parametrize("module, colonne", MODULES)
def test_la_suppression_compte_les_rendez_vous_avant_de_supprimer(module, colonne):
    """Le compte doit précéder le DELETE, sinon le garde-fou ne garde rien."""
    source = inspect.getsource(module)
    i_compte = source.index(f"FROM appointments WHERE {colonne}")
    i_delete = source.index("DELETE FROM")
    assert i_compte < i_delete, "le comptage doit venir AVANT la suppression"
    assert "inUse" in source, "le refus doit porter un code lisible"
    assert "409" in source


@pytest.mark.parametrize("module, colonne", MODULES)
def test_le_code_est_controle_unique(module, colonne):
    """Un doublon rendrait le référentiel ambigu partout où le code sert de clé."""
    source = inspect.getsource(module)
    assert source.count("duplicate") >= 2, (
        "création ET modification doivent refuser un code déjà pris"
    )


@pytest.mark.parametrize("module, colonne", MODULES)
def test_le_tri_suit_l_ordre_choisi_et_non_l_alphabet(module, colonne):
    """`ORDER BY code` donnait « Commande faite » avant « Commande à passer »."""
    source = inspect.getsource(module)
    assert "ORDER BY sortOrder" in source
    assert "ORDER BY code" not in source


@pytest.mark.parametrize("module, colonne", MODULES)
def test_le_libelle_est_lu_et_ecrit(module, colonne):
    """Il vivait dans `labels.ts`, donc dans le code : ajouter une entrée depuis
    un écran l'aurait affichée sous son code anglais.
    """
    source = inspect.getsource(module)
    assert "label" in source
    schema = inspect.getmodule(module).__dict__
    reponse = next(v for k, v in schema.items() if k.endswith("Response"))
    assert "label" in reponse.model_fields
    assert "sortOrder" in reponse.model_fields


def test_les_rendez_vous_rendent_les_libelles():
    """Sans cela, l'infobulle et les listes devraient connaître le référentiel."""
    from app.schemas.appointment import AppointmentWithJoinsResponse

    for champ in ("statusLabel", "categoryLabel"):
        assert champ in AppointmentWithJoinsResponse.model_fields

    source = inspect.getsource(__import__("app.routers.appointments", fromlist=["x"]))
    assert "ast.label AS statusLabel" in source
    assert "ac.label AS categoryLabel" in source
