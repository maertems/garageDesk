from datetime import date
from typing import Optional
from app.schemas.common import CamelModel


class WorkshopCarResponse(CamelModel):
    vehicleId: int
    brand: Optional[str] = None
    model: Optional[str] = None
    type: Optional[str] = None
    licensePlate: Optional[str] = None
    clientId: int
    clientFirstName: Optional[str] = None
    clientLastName: Optional[str] = None
    latestDocDate: Optional[date] = None
    latestDocType: Optional[str] = None
    lastPlanningDate: Optional[date] = None
