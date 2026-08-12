import pymysql
from contextlib import contextmanager
from app.config import settings


def get_connection():
    return pymysql.connect(
        host=settings.host,
        port=settings.port,
        user=settings.user,
        password=settings.password,
        database=settings.database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


@contextmanager
def db_cursor(commit=False):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


@contextmanager
def db_transaction():
    """Single connection, single commit, rollback on exception.

    Use for multi-statement atomic operations (invoice/credit note issuance,
    chronological numbering with SELECT ... FOR UPDATE). Unlike db_cursor, all
    statements share one transaction so they commit or roll back together.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
