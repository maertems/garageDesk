import queue
import threading
import time
from contextlib import contextmanager

import pymysql

from app.config import settings

# ---------------------------------------------------------------------------
# Pool de connexions.
#
# Chaque `db_cursor()` ouvrait une connexion neuve et la fermait aussitôt. Mesuré
# le 8 octobre 2026 sur la machine de production : connexion + un SELECT y
# coûtent ~125 ms, et chaque route en ouvre DEUX (session, puis données), soit un
# quart de seconde de plancher par appel avant la moindre donnée. Les connexions
# rendues sont donc gardées ouvertes et resservies.
#
# Dimensionnement : au plus `POOL_MAX_IDLE` connexions conservées au repos ; au-delà
# de ce nombre, une connexion rendue est fermée. Rien ne borne la création — si le
# pool est vide, on ouvre — parce qu'avec cinq utilisateurs au plus, une attente
# sur un sémaphore ne se produirait jamais et ne ferait qu'ajouter un cas d'erreur.
# ---------------------------------------------------------------------------
POOL_MAX_IDLE = 4
# Au-delà de cette durée au repos, la connexion est sondée (`ping`) avant usage :
# `wait_timeout` côté serveur vaut 8 h, mais un pare-feu ou un redémarrage de MySQL
# peuvent couper plus tôt, et une connexion morte ne se voit qu'à la première requête.
POOL_PING_AFTER_SECONDS = 60.0

_idle: "queue.LifoQueue[tuple[pymysql.connections.Connection, float]]" = queue.LifoQueue()
_lock = threading.Lock()


def _open_connection() -> pymysql.connections.Connection:
    return pymysql.connect(
        host=settings.host,
        port=settings.port,
        user=settings.user,
        password=settings.password,
        database=settings.database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_connection() -> pymysql.connections.Connection:
    """Connexion neuve, hors pool. Conservée pour les scripts ; le code de
    l'application passe par `db_cursor` / `db_transaction`."""
    return _open_connection()


def _acquire() -> pymysql.connections.Connection:
    while True:
        try:
            conn, released_at = _idle.get_nowait()
        except queue.Empty:
            return _open_connection()
        if time.monotonic() - released_at > POOL_PING_AFTER_SECONDS:
            try:
                conn.ping(reconnect=True)
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
                continue
        return conn


def _release(conn: pymysql.connections.Connection, *, broken: bool) -> None:
    if broken:
        try:
            conn.close()
        except Exception:
            pass
        return
    # autocommit est à faux : un simple SELECT a ouvert une transaction implicite
    # qui garderait ses verrous de lecture et sa vue cohérente sur la connexion
    # suivante. Elle est refermée avant le retour au pool. Pour une connexion qui
    # vient de `commit`, c'est un aller-retour pour rien, mais il coûte moins que
    # de suivre l'état de chaque connexion.
    try:
        conn.rollback()
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return
    with _lock:
        if _idle.qsize() >= POOL_MAX_IDLE:
            try:
                conn.close()
            except Exception:
                pass
            return
        _idle.put((conn, time.monotonic()))


def pool_size() -> int:
    """Connexions au repos dans le pool — pour les tests et le diagnostic."""
    return _idle.qsize()


@contextmanager
def db_cursor(commit=False):
    conn = _acquire()
    broken = False
    try:
        with conn.cursor() as cur:
            yield cur
        if commit:
            conn.commit()
    except pymysql.err.OperationalError:
        # Connexion probablement morte : elle ne retourne pas au pool.
        broken = True
        raise
    finally:
        _release(conn, broken=broken)


@contextmanager
def db_transaction():
    """Single connection, single commit, rollback on exception.

    Use for multi-statement atomic operations (invoice/credit note issuance,
    chronological numbering with SELECT ... FOR UPDATE). Unlike db_cursor, all
    statements share one transaction so they commit or roll back together.
    """
    conn = _acquire()
    broken = False
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except pymysql.err.OperationalError:
        broken = True
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        _release(conn, broken=broken)
