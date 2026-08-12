"""Headers router — read-only lookup for the document-creation UI.

Headers are created implicitly by POST /documents (new or reused); this file
only exposes a GET by id, used to display client/vehicle/kilometrage when a
new document is created "from" an existing header (e.g. a quote created from
a repair order).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.database import db_cursor
from app.schemas.billing_documents import HeaderResponse

router = APIRouter(prefix="/headers", tags=["headers"])

_HEADER_QUERY = """
    SELECT h.id, h.clientId, h.vehicleId, h.kilometrage,
           c.firstName AS clientFirstName, c.lastName AS clientLastName,
           v.licensePlate AS vehicleLicensePlate, v.brand AS vehicleBrand, v.model AS vehicleModel
    FROM headers h
    LEFT JOIN clients c ON c.id = h.clientId
    LEFT JOIN vehicles v ON v.id = h.vehicleId
    WHERE h.id = %s
"""


@router.get("/{header_id}", response_model=HeaderResponse, summary="Get header by id")
def get_header(header_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(_HEADER_QUERY, (header_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Header not found"})
    return HeaderResponse(**row)
