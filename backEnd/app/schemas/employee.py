from app.schemas.common import CamelModel


class EmployeeBase(CamelModel):
    firstName: str
    lastName: str
    category: str  # mechanic, bodywork, office, director


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(CamelModel):
    firstName: str | None = None
    lastName: str | None = None
    category: str | None = None


class EmployeeResponse(EmployeeBase):
    id: int
