"""Shared types and enum value tuples for the billing module.

Enum values mirror the ENUM columns of migrations 017-020 exactly (English camelCase).
Used by the per-domain schemas (filled in their respective lots) and by validation.
"""

from typing import Literal

# documents.documentType
DocumentType = Literal["repairOrder", "quote", "quoteAmendment", "counterSale"]

# documents.status
DocumentStatus = Literal["draft", "issued", "signed", "refused", "expired", "obsolete"]

# articles.unitCode
UnitCode = Literal["hour", "liter", "kilogram", "unit"]

# signatures.signerType
SignerType = Literal["client", "garage"]

# signatures.method
SignatureMethod = Literal[
    "paperScanned", "tabletSignature", "emailValidation", "smsCode", "recordedVerbal",
]

# invoices.clientType (Factur-X aligned; clients.clientType 'company' maps to 'business')
InvoiceClientType = Literal["individual", "business"]

# invoiceLines.sourceDocumentType / creditNoteLines.sourceDocumentType
SourceDocumentType = Literal["quote", "quoteAmendment", "repairOrderDiagnostic", "counterSale"]

# invoices.paymentStatus
PaymentStatus = Literal["unpaid", "partiallyPaid", "paid"]

# payments.paymentMethod
PaymentMethod = Literal["cash", "card", "wireTransfer", "check", "sepaDebit", "other"]

# creditNotes.refundMethod
RefundMethod = Literal["commercialCredit", "wireTransferRefund", "cashRefund", "other"]

# Numbering series (see numbering_service.SERIES_FORMATS)
NUMBERING_SERIES = (
    "repairOrder", "quote", "amendment", "counterSale", "invoice", "creditNote",
)
