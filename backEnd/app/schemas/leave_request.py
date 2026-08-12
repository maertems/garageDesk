from app.schemas.common import CamelModel
from datetime import date
from typing import Optional


class LeaveRequestBase(CamelModel):
    employeeId: int
    startDate: date
    endDate: date
    status: str = "pending"


class LeaveRequestCreate(CamelModel):
    employeeId: int
    startDate: date
    endDate: date


class LeaveRequestUpdate(CamelModel):
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    status: Optional[str] = None


class LeaveRequestResponse(LeaveRequestBase):
    id: int


class LeaveRequestWithEmployeeResponse(LeaveRequestResponse):
    employeeFirstName: Optional[str] = None
    employeeLastName: Optional[str] = None
