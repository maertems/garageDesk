"""Payments router — billing module. Lot H.

POST /payments              — record a payment; recalculates invoice amountPaid + paymentStatus
GET  /payments?invoiceId=   — list payments for an invoice (invoiceId required)
PATCH /payments/{id}/cancel — soft-cancel a payment; recalculates invoice
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.database import db_cursor, db_transaction
from app.schemas.billing_payments import (
    PaymentCancelRequest,
    PaymentCreate,
    PaymentResponse,
)
from app.services.audit_service import log_event

router = APIRouter(prefix="/payments", tags=["payments"])

_COLS = (
    "id, invoiceId, paidAt, amount, paymentMethod, isoPaymentMethodCode, "
    "reference, isCancelled, cancellationReason, createdAt, createdByUserId"
)

_VALID_METHODS = {"cash", "card", "wireTransfer", "check", "sepaDebit", "other"}


def _recalc_invoice(cur, invoice_id: int) -> str:
    """Recompute amountPaid and paymentStatus on the invoice.

    Must be called inside a db_transaction with the invoice row already locked
    (SELECT … FOR UPDATE called by the caller beforehand).

    Returns the new paymentStatus string.
    """
    cur.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE invoiceId = %s AND isCancelled = 0",
        (invoice_id,),
    )
    amount_paid = float(cur.fetchone()["total"])

    cur.execute("SELECT totalTtc FROM invoices WHERE id = %s", (invoice_id,))
    inv_row = cur.fetchone()
    total_ttc = float(inv_row["totalTtc"])

    if amount_paid <= 0:
        status = "unpaid"
    elif amount_paid >= total_ttc:
        status = "paid"
    else:
        status = "partiallyPaid"

    cur.execute(
        "UPDATE invoices SET amountPaid = %s, paymentStatus = %s WHERE id = %s",
        (amount_paid, status, invoice_id),
    )

    return status


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=PaymentResponse,
    status_code=201,
    summary="Record a payment for an invoice",
    description="Atomically inserts the payment and recalculates the invoice paymentStatus/amountPaid.",
)
def create_payment(data: PaymentCreate, current_user: dict = Depends(get_current_user)):
    if data.paymentMethod not in _VALID_METHODS:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalidPaymentMethod", "message": f"Unknown payment method '{data.paymentMethod}'"},
        )
    if data.amount <= 0:
        raise HTTPException(
            status_code=422,
            detail={"code": "invalidAmount", "message": "Payment amount must be > 0"},
        )

    # Validate invoice exists
    with db_cursor() as cur:
        cur.execute("SELECT id, paymentStatus FROM invoices WHERE id = %s", (data.invoiceId,))
        inv = cur.fetchone()
    if not inv:
        raise HTTPException(
            status_code=404,
            detail={"code": "notFound", "message": f"Invoice {data.invoiceId} not found"},
        )

    paid_at = data.paidAt or date.today()

    with db_transaction() as cur:
        # Lock the invoice row for the duration of the recalc
        cur.execute("SELECT id FROM invoices WHERE id = %s FOR UPDATE", (data.invoiceId,))

        cur.execute(
            """
            INSERT INTO payments (invoiceId, paidAt, amount, paymentMethod, reference, createdByUserId)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (data.invoiceId, paid_at, data.amount, data.paymentMethod, data.reference, current_user.get("id")),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        payment_id = cur.fetchone()["id"]

        new_status = _recalc_invoice(cur, data.invoiceId)

        log_event(
            cur,
            event_type="payment.created",
            entity_type="payment",
            entity_id=payment_id,
            user_id=current_user.get("id"),
            payload={"invoiceId": data.invoiceId, "amount": float(data.amount), "paymentMethod": data.paymentMethod, "invoicePaymentStatus": new_status},
        )

    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM payments WHERE id = %s", (payment_id,))
        row = cur.fetchone()
    return PaymentResponse(**row)


@router.get(
    "",
    response_model=list[PaymentResponse],
    summary="List payments for an invoice",
    description="invoiceId is required.",
)
def list_payments(
    invoice_id: int = Query(..., alias="invoiceId"),
    current_user: dict = Depends(get_current_user),
):
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM payments WHERE invoiceId = %s ORDER BY paidAt, id",
            (invoice_id,),
        )
        rows = cur.fetchall()
    return [PaymentResponse(**r) for r in rows]


@router.patch(
    "/{payment_id}/cancel",
    response_model=PaymentResponse,
    summary="Soft-cancel a payment",
    description="Sets isCancelled=True and recalculates the invoice. Cannot undo.",
)
def cancel_payment(
    payment_id: int,
    data: PaymentCancelRequest,
    current_user: dict = Depends(get_current_user),
):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM payments WHERE id = %s", (payment_id,))
        payment = cur.fetchone()
    if not payment:
        raise HTTPException(
            status_code=404,
            detail={"code": "notFound", "message": "Payment not found"},
        )
    if payment["isCancelled"]:
        raise HTTPException(
            status_code=422,
            detail={"code": "alreadyCancelled", "message": "Payment is already cancelled"},
        )

    with db_transaction() as cur:
        # Lock invoice for recalc
        cur.execute("SELECT id FROM invoices WHERE id = %s FOR UPDATE", (payment["invoiceId"],))

        cur.execute(
            "UPDATE payments SET isCancelled = 1, cancellationReason = %s WHERE id = %s",
            (data.cancellationReason, payment_id),
        )
        new_status = _recalc_invoice(cur, payment["invoiceId"])

        log_event(
            cur,
            event_type="payment.cancelled",
            entity_type="payment",
            entity_id=payment_id,
            user_id=current_user.get("id"),
            payload={"invoiceId": payment["invoiceId"], "amount": float(payment["amount"]), "reason": data.cancellationReason, "invoicePaymentStatus": new_status},
        )

    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM payments WHERE id = %s", (payment_id,))
        row = cur.fetchone()
    return PaymentResponse(**row)
