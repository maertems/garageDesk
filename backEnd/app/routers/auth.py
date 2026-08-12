from fastapi import APIRouter, HTTPException, Response, Depends, Request
from app.auth import get_user_by_login_password, create_session, get_current_user, delete_session
from app.config import settings
from app.schemas.auth import LoginRequest, LoginResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_session_id(request: Request) -> str | None:
    return request.headers.get(settings.sessionHeaderName) or request.cookies.get(settings.sessionCookieName)


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Login",
    description="Authenticate with login and password. Returns user and session_id; also sets sessionId cookie. Use X-Session-Id header on subsequent requests.",
)
def login(data: LoginRequest, response: Response):
    user = get_user_by_login_password(data.login, data.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "invalidCredentials", "message": "Invalid login or password"},
        )
    session_id = create_session(user["id"])
    response.set_cookie(
        key=settings.sessionCookieName,
        value=session_id,
        httponly=True,
        max_age=settings.sessionLifetimeSeconds,
        samesite="lax",
    )
    return LoginResponse(
        user=UserResponse(**user),
        session_id=session_id,
    )


@router.post("/logout")
def logout(request: Request, response: Response, current_user: dict = Depends(get_current_user)):
    sid = _get_session_id(request)
    if sid:
        delete_session(sid)
    response.delete_cookie(settings.sessionCookieName)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**current_user)
