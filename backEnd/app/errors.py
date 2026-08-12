from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


def error_response(code: str, message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message},
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    msg = first.get("msg", "Validation error")
    loc = first.get("loc", [])
    if len(loc) > 1:
        msg = f"{loc[-1]}: {msg}"
    return error_response("validationError", msg, 422)


async def http_exception_handler(request: Request, exc):
    if hasattr(exc, "detail") and isinstance(exc.detail, dict):
        code = exc.detail.get("code", "error")
        message = exc.detail.get("message", str(exc.detail))
    elif hasattr(exc, "detail"):
        code = "error"
        message = str(exc.detail)
    else:
        code = "error"
        message = "An error occurred"
    return JSONResponse(
        status_code=exc.status_code if hasattr(exc, "status_code") else 500,
        content={"code": code, "message": message},
    )
