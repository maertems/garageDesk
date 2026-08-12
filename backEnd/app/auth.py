import secrets
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyHeader

import bcrypt
import pymysql

from app.config import settings
from app.database import get_connection


SESSION_HEADER = APIKeyHeader(name=settings.sessionHeaderName, auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("ascii"))


def create_session(user_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(seconds=settings.sessionLifetimeSeconds)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO sessions (id, userId, expiresAt) VALUES (%s, %s, %s)",
                (session_id, user_id, expires_at),
            )
        conn.commit()
    finally:
        conn.close()
    return session_id


def get_user_by_session(session_id: str) -> dict | None:
    if not session_id:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.login, u.role
                FROM users u
                INNER JOIN sessions s ON s.userId = u.id
                WHERE s.id = %s AND s.expiresAt > %s
                """,
                (session_id, datetime.utcnow()),
            )
            row = cur.fetchone()
            return row
    finally:
        conn.close()


def get_user_by_login_password(login: str, password: str) -> dict | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, login, role, passwordHash FROM users WHERE login = %s",
                (login,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row or not verify_password(password, row["passwordHash"]):
        return None
    return {"id": row["id"], "login": row["login"], "role": row["role"]}


def delete_session(session_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
        conn.commit()
    finally:
        conn.close()


async def get_current_user(
    request: Request,
    session_id: str | None = Depends(SESSION_HEADER),
) -> dict:
    sid = session_id or request.cookies.get(settings.sessionCookieName)
    user = get_user_by_session(sid) if sid else None
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "message": "Invalid or expired session"},
        )
    return user


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden", "message": "Admin access required"},
        )
    return current_user
