"""Pydantic schemas for signatures (Lot E)."""

from datetime import datetime
from typing import Optional

from app.schemas.common import CamelModel
from app.schemas.billing_common import SignerType, SignatureMethod


class SignatureCreate(CamelModel):
    documentId: int
    signerType: SignerType
    signerName: Optional[str] = None
    signerEmail: Optional[str] = None
    method: SignatureMethod
    proofBlobPath: Optional[str] = None
    proofHash: Optional[str] = None
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None


class SignatureResponse(CamelModel):
    id: int
    documentId: int
    signerType: SignerType
    signerName: Optional[str] = None
    signerEmail: Optional[str] = None
    signedAt: datetime
    method: SignatureMethod
    proofBlobPath: Optional[str] = None
    proofHash: Optional[str] = None
    ipAddress: Optional[str] = None
    userAgent: Optional[str] = None
    createdAt: datetime
