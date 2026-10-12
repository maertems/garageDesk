"""Normalisation des noms à l'écriture d'un client — sans base de données."""
import pytest

from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate, nom_en_majuscules, prenom_capitalise


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
    assert ClientUpdate(city="Lille").model_dump(exclude_unset=True) == {"city": "Lille"}


def test_lecture_inchangee():
    r = ClientResponse(id=1, lastName="Lefevre", firstName="lionel")
    assert (r.lastName, r.firstName) == ("Lefevre", "lionel")
