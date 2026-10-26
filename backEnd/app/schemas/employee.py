from app.schemas.common import CamelModel, NomsNormalises


class EmployeeBase(CamelModel):
    firstName: str
    lastName: str
    category: str  # mechanic, bodywork, office, director


# Nom en majuscules, prénom capitalisé : même règle que les clients (§ 103).
class EmployeeCreate(NomsNormalises, EmployeeBase):
    pass


class EmployeeUpdate(NomsNormalises, CamelModel):
    firstName: str | None = None
    lastName: str | None = None
    category: str | None = None


class EmployeeResponse(EmployeeBase):
    id: int
