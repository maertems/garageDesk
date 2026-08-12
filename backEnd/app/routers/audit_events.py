"""Audit events router — billing module. Lot J.

GET /auditEvents — read-only list, filtered by entityType / entityId / eventType.
Audit events are INSERT-only; no UPDATE/DELETE endpoints are exposed.
"""

import json
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import db_cursor

router = APIRouter(prefix="/auditEvents", tags=["audit-events"])


class AuditEventResponse(BaseModel):
    id: int
    eventType: str
    entityType: str
    entityId: int | None
    userId: int | None
    payload: Any | None
    ipAddress: str | None
    createdAt: Any

    model_config = {"from_attributes": True}


@router.get(
    "",
    response_model=list[AuditEventResponse],
    summary="List audit events",
    description=(
        "Read-only. Filter by entityType + entityId to see events for a specific record, "
        "or by eventType to see a specific action across all records. "
        "Returns up to 200 events, most recent first."
    ),
)
def list_audit_events(
    entity_type: str | None = Query(None, alias="entityType"),
    entity_id: int | None = Query(None, alias="entityId"),
    event_type: str | None = Query(None, alias="eventType"),
    limit: int = Query(200, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    where_parts: list[str] = []
    params: list[Any] = []

    if entity_type:
        where_parts.append("entityType = %s")
        params.append(entity_type)
    if entity_id is not None:
        where_parts.append("entityId = %s")
        params.append(entity_id)
    if event_type:
        where_parts.append("eventType = %s")
        params.append(event_type)

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    params.append(limit)

    with db_cursor() as cur:
        cur.execute(
            "SELECT id, eventType, entityType, entityId, userId, payloadJson, ipAddress, createdAt "
            f"FROM auditEvents {where_sql} ORDER BY createdAt DESC, id DESC LIMIT %s",
            params,
        )
        rows = cur.fetchall()

    result = []
    for r in rows:
        payload = None
        if r.get("payloadJson"):
            try:
                payload = json.loads(r["payloadJson"])
            except Exception:
                payload = r["payloadJson"]
        result.append(
            AuditEventResponse(
                id=r["id"],
                eventType=r["eventType"],
                entityType=r["entityType"],
                entityId=r.get("entityId"),
                userId=r.get("userId"),
                payload=payload,
                ipAddress=r.get("ipAddress"),
                createdAt=r["createdAt"],
            )
        )
    return result
