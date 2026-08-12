"""Signatures router — billing module. Lot E, reworked 022.

POST /signatures          — sign a document (issued→signed)
GET  /signatures          — list by documentId
GET  /signatures/{id}     — get by id
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.database import db_transaction, db_cursor
from app.schemas.billing_signatures import SignatureCreate, SignatureResponse
from app.services.audit_service import log_event

router = APIRouter(prefix="/signatures", tags=["signatures"])

_COLS = (
    "id, documentId, signerType, signerName, signerEmail, signedAt, "
    "method, proofBlobPath, proofHash, ipAddress, userAgent, createdAt"
)


@router.get(
    "",
    response_model=list[SignatureResponse],
    summary="List signatures for a document",
    description="documentId is required.",
)
def list_signatures(
    document_id: int = Query(..., alias="documentId"),
    current_user: dict = Depends(get_current_user),
):
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM signatures WHERE documentId = %s ORDER BY signedAt",
            (document_id,),
        )
        rows = cur.fetchall()
    return [SignatureResponse(**r) for r in rows]


@router.get("/{sig_id}", response_model=SignatureResponse, summary="Get signature by id")
def get_signature(sig_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM signatures WHERE id = %s", (sig_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Signature not found"})
    return SignatureResponse(**row)


@router.post(
    "",
    response_model=SignatureResponse,
    status_code=201,
    summary="Sign a document",
    description="Document must be in 'issued' status. Atomically: creates signature, sets document→signed.",
)
def sign_document(data: SignatureCreate, current_user: dict = Depends(get_current_user)):
    # Pre-flight reads outside transaction (cheap, no lock needed)
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, status, documentType FROM documents WHERE id = %s",
            (data.documentId,),
        )
        doc = cur.fetchone()
    if not doc:
        raise HTTPException(
            status_code=404,
            detail={"code": "notFound", "message": "Document not found"},
        )
    if doc["status"] != "issued":
        raise HTTPException(
            status_code=422,
            detail={
                "code": "notIssued",
                "message": f"Document is '{doc['status']}' — only issued documents can be signed",
            },
        )

    signed_at = datetime.now()

    with db_transaction() as cur:
        # 1. Insert signature
        cur.execute(
            """
            INSERT INTO signatures
              (documentId, signerType, signerName, signerEmail, signedAt,
               method, proofBlobPath, proofHash, ipAddress, userAgent)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                data.documentId,
                data.signerType,
                data.signerName,
                data.signerEmail,
                signed_at,
                data.method,
                data.proofBlobPath,
                data.proofHash,
                data.ipAddress,
                data.userAgent,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        sig_id = cur.fetchone()["id"]

        # 2. Update document → signed, link signatureId
        cur.execute(
            "UPDATE documents SET status = 'signed', signatureId = %s WHERE id = %s",
            (sig_id, data.documentId),
        )

        log_event(
            cur,
            event_type="document.signed",
            entity_type="document",
            entity_id=data.documentId,
            user_id=current_user.get("id"),
            payload={"signatureId": sig_id, "signerType": data.signerType, "documentType": doc["documentType"], "method": data.method},
        )

    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM signatures WHERE id = %s", (sig_id,))
        row = cur.fetchone()
    return SignatureResponse(**row)
