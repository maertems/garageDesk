from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.bill_detail import BillDetailCreate, BillDetailUpdate, BillDetailResponse

router = APIRouter(prefix="/billDetails", tags=["bill-details"])


def _columns():
    return "id, billId, type, description, reference, time, timeEquivalentT1, priceHT, price, unitPrice, taxeType, taxe, cashBack"


@router.get("", response_model=list[BillDetailResponse], summary="List bill details")
def list_bill_details(
    current_user: dict = Depends(get_current_user),
    bill_id: int | None = Query(None, alias="billId"),
):
    with db_cursor() as cur:
        if bill_id is not None:
            cur.execute(
                f"SELECT {_columns()} FROM billDetails WHERE billId = %s ORDER BY id",
                (bill_id,),
            )
        else:
            cur.execute(f"SELECT {_columns()} FROM billDetails ORDER BY billId, id")
        rows = cur.fetchall()
    return [BillDetailResponse(**r) for r in rows]


@router.get("/{detail_id}", response_model=BillDetailResponse)
def get_bill_detail(detail_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute(f"SELECT {_columns()} FROM billDetails WHERE id = %s", (detail_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill detail not found"})
    return BillDetailResponse(**row)


@router.post("", response_model=BillDetailResponse, status_code=201)
def create_bill_detail(data: BillDetailCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO billDetails (billId, type, description, reference, time, timeEquivalentT1, priceHT, price, unitPrice, taxeType, taxe, cashBack)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                data.billId,
                data.type,
                data.description,
                data.reference,
                data.time,
                data.timeEquivalentT1,
                data.priceHT,
                data.price,
                data.unitPrice,
                data.taxeType,
                data.taxe,
                data.cashBack,
            ),
        )
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        detail_id = cur.fetchone()["id"]
    return get_bill_detail(detail_id, current_user)


@router.patch("/{detail_id}", response_model=BillDetailResponse)
def update_bill_detail(detail_id: int, data: BillDetailUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_bill_detail(detail_id, current_user)
    set_clause = ", ".join(f"`{k}` = %s" for k in updates.keys())
    values = list(updates.values()) + [detail_id]
    with db_cursor(commit=True) as cur:
        cur.execute(f"UPDATE billDetails SET {set_clause} WHERE id = %s", values)
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill detail not found"})
    return get_bill_detail(detail_id, current_user)


@router.delete("/{detail_id}", status_code=204)
def delete_bill_detail(detail_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM billDetails WHERE id = %s", (detail_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Bill detail not found"})
