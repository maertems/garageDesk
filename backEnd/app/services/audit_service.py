"""Audit trail for the billing module — INSERT-only into auditEvents.

Pass a cursor so the event participates in the caller's transaction (db_transaction
for issuance, db_cursor(commit=True) for simpler mutations). Never UPDATE/DELETE.
"""

import json


def log_event(
    cur,
    *,
    event_type: str,
    entity_type: str,
    entity_id: int | None = None,
    user_id: int | None = None,
    payload: dict | None = None,
    ip_address: str | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO auditEvents (eventType, entityType, entityId, userId, payloadJson, ipAddress)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            event_type,
            entity_type,
            entity_id,
            user_id,
            json.dumps(payload, default=str, ensure_ascii=False) if payload is not None else None,
            ip_address,
        ),
    )
