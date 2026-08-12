"""Articles catalogue router — billing module. Lot A: full CRUD (admin for writes).

GET  /articles       — list (search by label/reference/type, activeOnly filter; any user)
GET  /articles/{id}  — get by id (any user)
POST /articles       — create (admin only)
PATCH /articles/{id} — update, incl. isActive soft-disable (admin only)
DELETE /articles/{id} — delete (admin only)
"""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_admin, get_current_user
from app.database import db_cursor
from app.schemas.billing_articles import ArticleCreate, ArticleResponse, ArticleUpdate

router = APIRouter(prefix="/articles", tags=["articles"])

_COLS = "id, reference, type, label, unitCode, vatRateId, price, isActive, createdAt, updatedAt"


def _fetch_or_404(article_id: int) -> dict:
    with db_cursor() as cur:
        cur.execute(f"SELECT {_COLS} FROM articles WHERE id = %s", (article_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Article not found"})
    return row


@router.get(
    "",
    response_model=list[ArticleResponse],
    summary="List articles",
    description="List articles. Use search to filter on reference, label or type. Use activeOnly=true to exclude inactive.",
)
def list_articles(
    current_user: dict = Depends(get_current_user),
    search: str | None = Query(None, description="Search in reference, label, type"),
    active_only: bool = Query(False, alias="activeOnly", description="Exclude inactive articles"),
):
    where_parts: list[str] = []
    params: list = []
    if search:
        q = f"%{search}%"
        where_parts.append("(reference LIKE %s OR label LIKE %s OR type LIKE %s)")
        params.extend([q, q, q])
    if active_only:
        where_parts.append("isActive = TRUE")
    where = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {_COLS} FROM articles {where} ORDER BY isActive DESC, label ASC",
            params,
        )
        rows = cur.fetchall()
    return [ArticleResponse(**r) for r in rows]


@router.get("/{article_id}", response_model=ArticleResponse, summary="Get article by id")
def get_article(article_id: int, current_user: dict = Depends(get_current_user)):
    return ArticleResponse(**_fetch_or_404(article_id))


@router.post(
    "",
    response_model=ArticleResponse,
    status_code=201,
    summary="Create article",
    description="Admin only. reference must be unique if provided.",
)
def create_article(data: ArticleCreate, current_user: dict = Depends(get_current_admin)):
    if data.vatRateId is not None:
        with db_cursor() as cur:
            cur.execute("SELECT id FROM vatRates WHERE id = %s", (data.vatRateId,))
            if not cur.fetchone():
                raise HTTPException(
                    status_code=422,
                    detail={"code": "invalidReference", "message": f"vatRateId {data.vatRateId} not found"},
                )
    with db_cursor(commit=True) as cur:
        try:
            cur.execute(
                """
                INSERT INTO articles (reference, type, label, unitCode, vatRateId, price, isActive)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (data.reference, data.type, data.label, data.unitCode, data.vatRateId, data.price, data.isActive),
            )
            cur.execute("SELECT LAST_INSERT_ID() AS id")
            new_id = cur.fetchone()["id"]
        except Exception as exc:
            if "Duplicate entry" in str(exc):
                raise HTTPException(
                    status_code=409,
                    detail={"code": "duplicate", "message": f"Article reference '{data.reference}' already exists"},
                )
            raise
    return ArticleResponse(**_fetch_or_404(new_id))


@router.patch(
    "/{article_id}",
    response_model=ArticleResponse,
    summary="Update article",
    description="Admin only. Partial update. Use isActive=false to soft-disable.",
)
def update_article(article_id: int, data: ArticleUpdate, current_user: dict = Depends(get_current_admin)):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return ArticleResponse(**_fetch_or_404(article_id))
    if "vatRateId" in updates and updates["vatRateId"] is not None:
        with db_cursor() as cur:
            cur.execute("SELECT id FROM vatRates WHERE id = %s", (updates["vatRateId"],))
            if not cur.fetchone():
                raise HTTPException(
                    status_code=422,
                    detail={"code": "invalidReference", "message": f"vatRateId {updates['vatRateId']} not found"},
                )
    set_clause = ", ".join(f"`{k}` = %s" for k in updates)
    values = list(updates.values()) + [article_id]
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(f"UPDATE articles SET {set_clause} WHERE id = %s", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Article not found"})
    except HTTPException:
        raise
    except Exception as exc:
        if "Duplicate entry" in str(exc):
            raise HTTPException(status_code=409, detail={"code": "duplicate", "message": "Article reference already exists"})
        raise
    return ArticleResponse(**_fetch_or_404(article_id))


@router.delete(
    "/{article_id}",
    status_code=204,
    summary="Delete article",
    description="Admin only. No FK constraints: documentLines referencing this article keep their own snapshotted values.",
)
def delete_article(article_id: int, current_user: dict = Depends(get_current_admin)):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM articles WHERE id = %s", (article_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail={"code": "notFound", "message": "Article not found"})
