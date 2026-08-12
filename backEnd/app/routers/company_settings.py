"""Company settings router — billing module. Lot B: GET + PATCH (admin).

There is always exactly one row (id=1, seeded in migration 021).

GET  /companySettings       — get issuer settings + missingMandatoryFields (any authenticated user)
PATCH /companySettings      — partial update (admin only)
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_admin, get_current_user
from app.database import db_cursor
from app.schemas.billing_company import CompanySettingsResponse, CompanySettingsUpdate
from app.services.billing_settings import check_mandatory_fields

router = APIRouter(prefix="/companySettings", tags=["company-settings"])

_COLS = (
    "id, name, shareCapital, siren, siretHeadquarters, rcsCity, vatIntracom, nafCode, "
    "addressLine1, postalCode, city, countryCode, phone, email, "
    "iban, bic, mediatorName, mediatorUrl, mediatorAddress, vatExemption, createdAt, updatedAt"
)


def _fetch() -> dict:
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM companySettings WHERE id = 1")
        row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=500,
            detail={"code": "missingRow", "message": "companySettings row id=1 not found — run seed migration"},
        )
    return row


@router.get(
    "",
    response_model=CompanySettingsResponse,
    summary="Get company settings",
    description="Returns issuer settings (single row) and the list of missing mandatory fields for invoice issuance.",
)
def get_company_settings(current_user: dict = Depends(get_current_user)):
    row = _fetch()
    return CompanySettingsResponse(**row, missingMandatoryFields=check_mandatory_fields(row))


@router.patch(
    "",
    response_model=CompanySettingsResponse,
    summary="Update company settings",
    description="Admin only. Partial update — only provided fields are changed.",
)
def update_company_settings(data: CompanySettingsUpdate, current_user: dict = Depends(get_current_admin)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        row = _fetch()
        return CompanySettingsResponse(**row, missingMandatoryFields=check_mandatory_fields(row))
    set_clause = ", ".join(f"`{k}` = %s" for k in updates)
    values = list(updates.values())
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE companySettings SET {set_clause} WHERE id = 1", values)
    row = _fetch()
    return CompanySettingsResponse(**row, missingMandatoryFields=check_mandatory_fields(row))
