"""Plaques d'immatriculation et VIN normalisés à l'écriture — sans base de données."""
import pytest
from pydantic import ValidationError

from app.schemas.common import plaque_normalisee
from app.schemas.loan_vehicle import LoanVehicleCreate, LoanVehicleUpdate
from app.schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate


@pytest.mark.parametrize(
    "brut, attendu",
    [
        # SIV : tirets, quelle que soit la saisie.
        ("AB123CD", "AB-123-CD"),
        ("ab123cd", "AB-123-CD"),
        ("AB 123 CD", "AB-123-CD"),
        ("ab-123-cd", "AB-123-CD"),
        ("  ab -123 - cd ", "AB-123-CD"),
        # FNI : espaces.
        ("12AZE59", "12 AZE 59"),
        ("12 aze 59", "12 AZE 59"),
        ("1234-AB-75", "1234 AB 75"),
        ("1a59", "1 A 59"),
        # FNI Corse : département 2A / 2B.
        ("1234ab2a", "1234 AB 2A"),
        ("1234 AB 2B", "1234 AB 2B"),
        ("12-a-2a", "12 A 2A"),
        # Non reconnu : majuscules, espaces resserrées, séparateurs gardés.
        ("w  garage", "W GARAGE"),
        ("b-ab-1234", "B-AB-1234"),
        ("", ""),
        (None, None),
    ],
)
def test_plaque_normalisee(brut, attendu):
    assert plaque_normalisee(brut) == attendu


@pytest.mark.parametrize("brut", ["AB.123.CD", "AB_123_CD", "AB-123-CD!", "AB/123/CD", "ÉB-123-CD"])
def test_plaque_caractere_refuse(brut):
    with pytest.raises(ValidationError) as exc:
        VehicleCreate(clientId=1, licensePlate=brut)
    assert "seuls les lettres" in str(exc.value)


def test_vehicule_creation_et_modification():
    assert VehicleCreate(clientId=1, licensePlate="ab123cd").licensePlate == "AB-123-CD"
    assert VehicleUpdate(licensePlate="ef 456 gh").model_dump(exclude_unset=True) == {"licensePlate": "EF-456-GH"}
    assert VehicleUpdate(mileage=1000).model_dump(exclude_unset=True) == {"mileage": 1000}


def test_vin_en_majuscules():
    assert VehicleCreate(clientId=1, licensePlate="AB-123-CD", vin=" vf1abc123def45678 ").vin == "VF1ABC123DEF45678"
    assert VehicleUpdate(vin="wvwzzz1jz3w386752").model_dump(exclude_unset=True) == {"vin": "WVWZZZ1JZ3W386752"}
    assert VehicleUpdate(vin="").vin == ""


def test_vehicule_de_pret():
    assert LoanVehicleCreate(licensePlate="ij789kl", uniqueNumber="P1").licensePlate == "IJ-789-KL"
    assert LoanVehicleUpdate(licensePlate="mn-012-op").licensePlate == "MN-012-OP"


def test_lecture_inchangee():
    assert VehicleResponse(id=1, clientId=1, licensePlate="ab 123 cd", vin="abc").licensePlate == "ab 123 cd"
