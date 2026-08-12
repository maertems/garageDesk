from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.common import CamelModel, serialize_datetime_iso_utc
from datetime import datetime
from pydantic import field_serializer

router = APIRouter(prefix="/synchronization", tags=["synchronization"])


class SyncEntry(CamelModel):
    id: int
    key: str
    value: str
    createdAt: datetime

    @field_serializer("createdAt")
    def serialize_created_at(self, v: datetime) -> str:
        return serialize_datetime_iso_utc(v)


@router.get("", response_model=list[SyncEntry])
def list_sync(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, `key`, `value`, createdAt FROM synchronization ORDER BY id")
        rows = cur.fetchall()
    return [SyncEntry(**r) for r in rows]


@router.delete("/{entry_id}", status_code=204)
def delete_sync(entry_id: int, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM synchronization WHERE id = %s", (entry_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Entry not found"})
