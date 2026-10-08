import secrets
import threading
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, Request
from fastapi.security import APIKeyHeader

import bcrypt

from app.config import settings
from app.database import db_cursor


SESSION_HEADER = APIKeyHeader(name=settings.sessionHeaderName, auto_error=False)

# ---------------------------------------------------------------------------
# Cache mémoire des sessions.
#
# Toute route protégée commençait par un SELECT sur `sessions` — sur une
# connexion MySQL ouverte pour l'occasion. Avec cinq utilisateurs au plus, ces
# sessions tiennent dans un dictionnaire : identifiant → (utilisateur, échéance
# du cache). Une entrée vaut au plus `SESSION_CACHE_TTL`, et jamais au-delà de
# l'expiration réelle en base. Absente ou périmée, on retombe sur le SELECT, qui
# regarnit le cache. La déconnexion retire l'entrée : sans cela, une session
# fermée resterait acceptée jusqu'à son échéance.
#
# Un seul processus uvicorn sert l'application, donc un seul cache : c'est ce qui
# rend la déconnexion immédiate. Passer à plusieurs workers demanderait de
# raccourcir fortement le TTL, chaque worker ayant alors son propre dictionnaire.
# ---------------------------------------------------------------------------
SESSION_CACHE_TTL = timedelta(hours=2)
_session_cache: dict[str, tuple[dict, datetime]] = {}
_session_cache_lock = threading.Lock()


def _cache_get(session_id: str) -> dict | None:
    with _session_cache_lock:
        entry = _session_cache.get(session_id)
        if entry is None:
            return None
        user, expires_at = entry
        if expires_at <= datetime.utcnow():
            del _session_cache[session_id]
            return None
        return dict(user)


def _cache_put(session_id: str, user: dict, session_expires_at: datetime) -> None:
    now = datetime.utcnow()
    expires_at = min(now + SESSION_CACHE_TTL, session_expires_at)
    with _session_cache_lock:
        # Balayage des entrées périmées, à l'occasion d'une insertion : le
        # dictionnaire ne grossit pas avec les sessions mortes.
        if len(_session_cache) >= 256:
            for sid in [s for s, (_, exp) in _session_cache.items() if exp <= now]:
                del _session_cache[sid]
        _session_cache[session_id] = (dict(user), expires_at)


def _cache_evict(session_id: str) -> None:
    with _session_cache_lock:
        _session_cache.pop(session_id, None)


def session_cache_size() -> int:
    """Pour les tests et le diagnostic."""
    with _session_cache_lock:
        return len(_session_cache)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("ascii"))


def create_session(user_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(seconds=settings.sessionLifetimeSeconds)
    with db_cursor(commit=True) as cur:
        # La table n'était jamais purgée : 2 241 lignes pour 890 sessions valides le
        # 8 octobre 2026. Une connexion est le bon moment pour retirer les mortes —
        # rare, et l'index sur `expiresAt` rend le DELETE immédiat.
        cur.execute("DELETE FROM sessions WHERE expiresAt <= %s", (datetime.utcnow(),))
        cur.execute(
            "INSERT INTO sessions (id, userId, expiresAt) VALUES (%s, %s, %s)",
            (session_id, user_id, expires_at),
        )
    return session_id


def get_user_by_session(session_id: str) -> dict | None:
    if not session_id:
        return None
    cached = _cache_get(session_id)
    if cached is not None:
        return cached
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT u.id, u.login, u.role, s.expiresAt
            FROM users u
            INNER JOIN sessions s ON s.userId = u.id
            WHERE s.id = %s AND s.expiresAt > %s
            """,
            (session_id, datetime.utcnow()),
        )
        row = cur.fetchone()
    if not row:
        return None
    expires_at = row.pop("expiresAt")
    _cache_put(session_id, row, expires_at)
    return row


def get_user_by_login_password(login: str, password: str) -> dict | None:
    with db_cursor() as cur:
        cur.execute(
            "SELECT id, login, role, passwordHash FROM users WHERE login = %s",
            (login,),
        )
        row = cur.fetchone()
    if not row or not verify_password(password, row["passwordHash"]):
        return None
    return {"id": row["id"], "login": row["login"], "role": row["role"]}


def delete_session(session_id: str) -> None:
    _cache_evict(session_id)
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM sessions WHERE id = %s", (session_id,))


# `def`, et non `async def` : la version asynchrone appelait pymysql, qui bloque,
# depuis la boucle d'événements d'uvicorn — pendant la requête SQL, le serveur ne
# servait personne d'autre. Mesuré en production le 8 octobre 2026 : sept appels
# protégés en parallèle mettaient 1,27 s, en escalier de 0,16 s, contre 0,16 s pour
# sept appels sans base. Une dépendance synchrone est exécutée par FastAPI dans son
# pool de threads, et les vérifications se font en parallèle.
def get_current_user(
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
