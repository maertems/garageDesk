"""VAT rates router — billing module. Lot A: full CRUD (admin for writes).

GET  /vatRates       — list all, ordered by rate (any authenticated user)
GET  /vatRates/{id}  — get by id (any authenticated user)
POST /vatRates       — create (admin only)
PATCH /vatRates/{id} — update (admin only)
DELETE /vatRates/{id} — delete (admin only), blocked if still referenced by an article
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_admin, get_current_user
from app.database import db_cursor
from app.schemas.billing_articles import VatRateCreate, VatRateResponse, VatRateUpdate

router = APIRouter(prefix="/vatRates", tags=["vat-rates"])

_COLS = "id, code, rate, label, facturXCategory, validFrom, validUntil, createdAt, updatedAt"


def _fetch_or_404(vat_rate_id: int) -> dict:
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM vatRates WHERE id = %s", (vat_rate_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "VAT rate not found"})
    return row


@router.get(
    "",
    response_model=list[VatRateResponse],
    summary="List VAT rates",
    description="List all VAT rates ordered by rate ascending.",
)
def list_vat_rates(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM vatRates ORDER BY rate ASC, code ASC")
        rows = cur.fetchall()
    return [VatRateResponse(**r) for r in rows]


@router.get("/{vat_rate_id}", response_model=VatRateResponse, summary="Get VAT rate by id")
def get_vat_rate(vat_rate_id: int, current_user: dict = Depends(get_current_user)):
    return VatRateResponse(**_fetch_or_404(vat_rate_id))


@router.post(
    "",
    response_model=VatRateResponse,
    status_code=201,
    summary="Create VAT rate",
    description="Admin only. Code must be unique.",
)
def create_vat_rate(data: VatRateCreate, current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        try:
            cur.execute(
                """
                INSERT INTO vatRates (code, rate, label, facturXCategory, validFrom, validUntil)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (data.code, data.rate, data.label, data.facturXCategory, data.validFrom, data.validUntil),
            )
            cur.execute("SELECT LAST_INSERT_ID() AS id")
            new_id = cur.fetchone()["id"]
        except Exception as exc:
            if "Duplicate entry" in str(exc):
                raise HTTPException(
                    status_code=409,
                    detail={"code": "duplicate", "message": f"VAT rate code '{data.code}' already exists"},
                )
            raise
    return VatRateResponse(**_fetch_or_404(new_id))


@router.patch(
    "/{vat_rate_id}",
    response_model=VatRateResponse,
    summary="Update VAT rate",
    description="Admin only. Partial update.",
)
def update_vat_rate(vat_rate_id: int, data: VatRateUpdate, current_user: dict = Depends(get_current_admin)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return VatRateResponse(**_fetch_or_404(vat_rate_id))
    set_clause = ", ".join(f"`{k}` = %s" for k in updates)
    values = list(updates.values()) + [vat_rate_id]
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(f"UPDATE vatRates SET {set_clause} WHERE id = %s", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail={"code": "notFound", "message": "VAT rate not found"})
    except HTTPException:
        raise
    except Exception as exc:
        if "Duplicate entry" in str(exc):
            raise HTTPException(status_code=409, detail={"code": "duplicate", "message": "VAT rate code already exists"})
        raise
    return VatRateResponse(**_fetch_or_404(vat_rate_id))


@router.delete(
    "/{vat_rate_id}",
    status_code=204,
    summary="Delete VAT rate",
    description="Admin only. Blocked (409) if any article still references this VAT rate.",
)
def delete_vat_rate(vat_rate_id: int, current_user: dict = Depends(get_current_admin)):
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM articles WHERE vatRateId = %s", (vat_rate_id,))
        in_use = cur.fetchone()["n"] > 0
    if in_use:
        raise HTTPException(
            status_code=409,
            detail={"code": "inUse", "message": "This VAT rate is still used by one or more articles"},
        )
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM vatRates WHERE id = %s", (vat_rate_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "VAT rate not found"})
