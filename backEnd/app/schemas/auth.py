from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    login: str
    password: str


class UserResponse(CamelModel):
    id: int
    login: str
    role: str


class LoginResponse(CamelModel):
    user: UserResponse
    session_id: str  # also sent in cookie
