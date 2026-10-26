"""Noms des salariés : même règle que les clients — sans base de données."""
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate


def test_creation_normalise():
    e = EmployeeCreate(lastName="lefevre", firstName="jEAN-pierre", category="mechanic")
    assert (e.lastName, e.firstName) == ("LEFEVRE", "Jean-Pierre")


def test_modification_partielle():
    assert EmployeeUpdate(firstName="marie claire").model_dump(exclude_unset=True) == {"firstName": "Marie Claire"}
    assert EmployeeUpdate(category="office").model_dump(exclude_unset=True) == {"category": "office"}


def test_lecture_inchangee():
    r = EmployeeResponse(id=1, lastName="Lefevre", firstName="lionel", category="mechanic")
    assert (r.lastName, r.firstName) == ("Lefevre", "lionel")
