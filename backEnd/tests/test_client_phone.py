"""Numéros de téléphone collés à l'écriture d'un client — sans base de données."""
import pytest
from pydantic import ValidationError

from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.schemas.common import telephone_normalise


@pytest.mark.parametrize(
    "brut, attendu",
    [
        ("06.34.34.34.34", "0634343434"),
        ("06 34 34 34 34", "0634343434"),
        ("06-34-34-34-34", "0634343434"),
        ("0634353556", "0634353556"),
        ("+32 475 12.34-56", "+32475123456"),
        # France en international : ramené au national.
        ("+33666666666", "0666666666"),
        ("+33 6 34 34 34 34", "0634343434"),
        ("+33 (0)6 34 34 34 34", "0634343434"),
        ("0033634343434", "0033634343434"),
        ("+33", "+33"),
        ("\t0634343434", "0634343434"),
        ("", ""),
        (None, None),
    ],
)
def test_telephone_normalise(brut, attendu):
    assert telephone_normalise(brut) == attendu


@pytest.mark.parametrize("brut", ["06 34 34 34 34 (bureau)", "abc", "06+34343434", "++33634343434", "06/34/34/34/34"])
def test_telephone_refuse(brut):
    with pytest.raises(ValidationError) as exc:
        ClientCreate(lastName="Dupont", phone=brut)
    assert "chiffres seulement" in str(exc.value)


def test_creation_et_modification():
    assert ClientCreate(lastName="Dupont", phone="06.34.34.34.34").phone == "0634343434"
    assert ClientUpdate(phone="+32 475 12 34 56").model_dump(exclude_unset=True) == {"phone": "+32475123456"}
    assert ClientUpdate(city="Lille").model_dump(exclude_unset=True) == {"city": "Lille"}


def test_lecture_inchangee():
    assert ClientResponse(id=1, lastName="Dupont", phone="06 34 34 34 34").phone == "06 34 34 34 34"
