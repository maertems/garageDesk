"""Company settings router — billing module. Lot B: GET + PATCH (admin).

There is always exactly one row (id=1, seeded in migration 021).

GET  /companySettings       — get issuer settings + missingMandatoryFields (any authenticated user)
PATCH /companySettings      — partial update (admin only)
"""

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException, Response

from app.auth import get_current_admin, get_current_user
from app.database import db_cursor
from app.schemas.billing_company import (
    CompanyLogoUpload,
    CompanySettingsResponse,
    CompanySettingsUpdate,
)
from app.services.billing_settings import check_mandatory_fields
from app.services.company_logo import ALLOWED_MIME_TYPES, MAX_LOGO_BYTES

router = APIRouter(prefix="/companySettings", tags=["company-settings"])

_COLS = (
    "id, name, shareCapital, siren, siretHeadquarters, rcsCity, vatIntracom, nafCode, "
    "addressLine1, postalCode, city, countryCode, phone, email, "
    "iban, bic, mediatorName, mediatorUrl, mediatorAddress, vatExemption, createdAt, updatedAt"
)


def _fetch() -> dict:
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS}, (logo IS NOT NULL) AS hasLogo FROM companySettings WHERE id = 1"
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=500,
            detail={"code": "missingRow", "message": "companySettings row id=1 not found — run seed migration"},
        )
    row["hasLogo"] = bool(row.get("hasLogo"))
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


# ── Logo (migration 026) ──────────────────────────────────────────────────────
# Le binaire est tenu à l'écart du JSON de réglages : il est rechargé à chaque
# affichage de la page Paramètres, et des octets bruts n'ont pas leur place dans
# une réponse JSON. `hasLogo` annonce sa présence, ces trois routes le manipulent.


@router.get(
    "/logo",
    summary="Logo de l'entreprise",
    description="Image brute, avec son type MIME d'origine. 404 si aucun logo n'est enregistré.",
    response_class=Response,
    responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}},
)
def get_company_logo(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT logo, logoMimeType FROM companySettings WHERE id = 1")
        row = cur.fetchone()
    if not row or not row.get("logo"):
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "No logo"})
    return Response(
        content=row["logo"],
        media_type=row.get("logoMimeType") or "application/octet-stream",
        # Le logo change rarement mais doit se rafraîchir aussitôt remplacé :
        # revalidation systématique plutôt qu'une durée de cache arbitraire.
        headers={"Cache-Control": "no-cache"},
    )


@router.put(
    "/logo",
    response_model=CompanySettingsResponse,
    summary="Remplacer le logo",
    description="Admin uniquement. PNG ou JPEG encodé en base64, 2 Mo maximum une fois décodé.",
)
def upload_company_logo(data: CompanyLogoUpload, current_user: dict = Depends(get_current_admin)):
    """Téléversement en base64 dans du JSON plutôt qu'en multipart.

    Le proxy du frontend impose `Content-Type: application/json` et relit le corps
    en texte : un multipart y perdrait sa frontière et ses octets. Le base64 passe
    intact par le même tuyau que le reste de l'API, au prix d'un tiers de volume
    supplémentaire sur le transfert — négligeable pour un logo.
    """
    if data.mimeType not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "unsupportedMediaType",
                "message": f"Format non géré ({data.mimeType}) — PNG ou JPEG attendu.",
            },
        )
    # Une balise « data:image/png;base64, » traîne souvent en tête quand l'image
    # vient d'un FileReader : on la retire plutôt que d'échouer au décodage.
    payload = data.dataBase64.split(",", 1)[-1] if data.dataBase64.startswith("data:") else data.dataBase64
    try:
        content = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(
            status_code=400, detail={"code": "invalidBase64", "message": "Contenu base64 illisible."}
        )
    if not content:
        raise HTTPException(status_code=400, detail={"code": "emptyFile", "message": "Fichier vide."})
    if len(content) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "fileTooLarge",
                "message": f"Fichier trop volumineux ({len(content) // 1024} Ko) — 2 Mo maximum.",
            },
        )
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE companySettings SET logo = %s, logoMimeType = %s WHERE id = 1",
            (content, data.mimeType),
        )
    row = _fetch()
    return CompanySettingsResponse(**row, missingMandatoryFields=check_mandatory_fields(row))


@router.delete(
    "/logo",
    response_model=CompanySettingsResponse,
    summary="Retirer le logo",
    description="Admin uniquement. Les documents repartent sans logo, comme avant son ajout.",
)
def delete_company_logo(current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE companySettings SET logo = NULL, logoMimeType = NULL WHERE id = 1")
    row = _fetch()
    return CompanySettingsResponse(**row, missingMandatoryFields=check_mandatory_fields(row))
