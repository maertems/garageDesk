"""Normalisation des noms à l'écriture d'un client — sans base de données."""
import pytest

from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.schemas.common import nom_en_majuscules, prenom_capitalise


@pytest.mark.parametrize(
    "brut, attendu",
    [
        ("jean-pierre", "Jean-Pierre"),
        ("MARIE claire", "Marie Claire"),
        ("  éric  ", "Éric"),
        ("anne-sophie du val", "Anne-Sophie Du Val"),
        ("", ""),
        (None, None),
    ],
)
def test_prenom_capitalise(brut, attendu):
    assert prenom_capitalise(brut) == attendu


@pytest.mark.parametrize(
    "brut, attendu",
    [("dupont", "DUPONT"), ("  de la  fontaine ", "DE LA FONTAINE"), ("lefèvre", "LEFÈVRE"), (None, None)],
)
def test_nom_en_majuscules(brut, attendu):
    assert nom_en_majuscules(brut) == attendu


def test_creation_normalise():
    c = ClientCreate(lastName="lefevre", firstName="lionel")
    assert (c.lastName, c.firstName) == ("LEFEVRE", "Lionel")


def test_modification_normalise_sans_toucher_aux_autres_champs():
    assert ClientUpdate(firstName="jEAN-luc").model_dump(exclude_unset=True) == {"firstName": "Jean-Luc"}
    assert ClientUpdate(postalCode="59000").model_dump(exclude_unset=True) == {"postalCode": "59000"}


def test_ville_en_majuscules():
    assert ClientCreate(lastName="Dupont", city="  villeneuve  d'ascq ").city == "VILLENEUVE D'ASCQ"
    assert ClientUpdate(city="lille").model_dump(exclude_unset=True) == {"city": "LILLE"}
    assert ClientUpdate(city="").city == ""
    assert ClientUpdate(phone="0634343434").model_dump(exclude_unset=True) == {"phone": "0634343434"}


def test_lecture_inchangee():
    r = ClientResponse(id=1, lastName="Lefevre", firstName="lionel", city="Lille")
    assert (r.lastName, r.firstName, r.city) == ("Lefevre", "lionel", "Lille")
