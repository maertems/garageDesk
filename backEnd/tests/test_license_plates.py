"""Plaques d'immatriculation en majuscules à l'écriture — sans base de données."""
import pytest

from app.schemas.common import plaque_en_majuscules
from app.schemas.loan_vehicle import LoanVehicleCreate, LoanVehicleUpdate
from app.schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate


@pytest.mark.parametrize(
    "brut, attendu",
    [("ab-123-cd", "AB-123-CD"), ("  ab 123  cd ", "AB 123 CD"), ("1234 abc 59", "1234 ABC 59"), ("", ""), (None, None)],
)
def test_plaque_en_majuscules(brut, attendu):
    assert plaque_en_majuscules(brut) == attendu


def test_vehicule_creation_et_modification():
    assert VehicleCreate(clientId=1, licensePlate="ab-123-cd").licensePlate == "AB-123-CD"
    assert VehicleUpdate(licensePlate="ef-456-gh").model_dump(exclude_unset=True) == {"licensePlate": "EF-456-GH"}
    assert VehicleUpdate(mileage=1000).model_dump(exclude_unset=True) == {"mileage": 1000}


def test_vehicule_de_pret():
    assert LoanVehicleCreate(licensePlate="ij-789-kl", uniqueNumber="P1").licensePlate == "IJ-789-KL"
    assert LoanVehicleUpdate(licensePlate="mn-012-op").licensePlate == "MN-012-OP"


def test_lecture_inchangee():
    assert VehicleResponse(id=1, clientId=1, licensePlate="ab-123-cd").licensePlate == "ab-123-cd"
