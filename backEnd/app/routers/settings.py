from fastapi import APIRouter, Depends, HTTPException
from app.database import db_cursor
from app.auth import get_current_user
from app.schemas.setting import SettingCreate, SettingUpdate, SettingResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=list[SettingResponse])
def list_settings(current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, `key`, value FROM settings ORDER BY `key`")
        rows = cur.fetchall()
    return [SettingResponse(id=r["id"], key=r["key"], value=r["value"]) for r in rows]


@router.get("/{key}", response_model=SettingResponse)
def get_setting(key: str, current_user: dict = Depends(get_current_user)):
    with db_cursor() as cur:
        cur.execute("SELECT id, `key`, value FROM settings WHERE `key` = %s", (key,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Setting not found"})
    return SettingResponse(**row)


@router.post("", response_model=SettingResponse, status_code=201)
def create_setting(data: SettingCreate, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("INSERT INTO settings (`key`, value) VALUES (%s, %s)", (data.key, data.value))
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        sid = cur.fetchone()["id"]
    with db_cursor() as cur:
        cur.execute("SELECT id, `key`, value FROM settings WHERE id = %s", (sid,))
        row = cur.fetchone()
    return SettingResponse(**row)


@router.patch("/{key}", response_model=SettingResponse)
def update_setting(key: str, data: SettingUpdate, current_user: dict = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return get_setting(key, current_user)
    value = updates.get("value")
    with db_cursor(commit=True) as cur:
        cur.execute("UPDATE settings SET value = %s WHERE `key` = %s", (value, key))
        if cur.rowcount == 0:
            cur.execute("INSERT INTO settings (`key`, value) VALUES (%s, %s)", (key, value))
    with db_cursor() as cur:
        cur.execute("SELECT id, `key`, value FROM settings WHERE `key` = %s", (key,))
        row = cur.fetchone()
    return SettingResponse(**row)


@router.delete("/{key}", status_code=204)
def delete_setting(key: str, current_user: dict = Depends(get_current_user)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM settings WHERE `key` = %s", (key,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Setting not found"})
