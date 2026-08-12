import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings as app_settings
from app.errors import validation_exception_handler, http_exception_handler
from app.routers import (
    auth,
    clients,
    vehicles,
    vehicle_details,
    appointments,
    appointment_categories,
    appointment_statuses,
    employees,
    leave_requests,
    loan_vehicles,
    loan_reservations,
    settings,
    notifications,
    bills,
    bill_details,
    time_cases,
    time_case_categories,
    workshop,
    workshop_planning,
    synchronization,
    # billing module (Vague 0 skeletons; endpoints filled in their lots)
    vat_rates,
    articles,
    company_settings,
    headers,
    billing_documents,
    signatures,
    invoices,
    payments,
    credit_notes,
    audit_events,
)
from app.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    lifespan=lifespan,
    title=f"{app_settings.appName} API",
    description=f"""
API REST pour l'intranet {app_settings.appName} : rendez-vous, clients, véhicules, salariés, congés, véhicules de prêt, paramètres.

**Authentification** : session côté serveur. Après `POST /api/v1/auth/login`, le serveur renvoie un cookie `sessionId` et le client doit envoyer le même identifiant dans le header `X-Session-Id` pour les appels suivants.

**Cas d'usage typiques** :
- Récupérer les RDV de la semaine : `GET /api/v1/appointments?start=...&end=...`
- Créer un RDV avec client et véhicule : `POST /api/v1/appointments` (body: clientId, vehicleId, categoryId, statusId, startTime, endTime)
- Lister les clients avec véhicules (préchargement) : `GET /api/v1/clients?withVehicles=true`
- Lister les congés du mois : `GET /api/v1/leaveRequests?month=1&year=2025`
- Lister les réservations de prêt pour une plage : `GET /api/v1/loanReservations?start=...&end=...`
""",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)


@app.middleware("http")
async def audit_log_middleware(request: Request, call_next):
    if request.method not in ("POST", "PATCH", "PUT", "DELETE"):
        return await call_next(request)

    body_bytes = await request.body()  # met en cache dans request._body pour les route handlers
    response = await call_next(request)

    if response.status_code < 400:
        from app.config import settings as app_settings
        from app.auth import get_user_by_session
        from app.services.log_service import log_action

        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0].strip() if forwarded else (
            request.client.host if request.client else "unknown"
        )
        session_id = (
            request.headers.get(app_settings.sessionHeaderName)
            or request.cookies.get(app_settings.sessionCookieName)
        )
        user = get_user_by_session(session_id) if session_id else None

        params = None
        if body_bytes:
            try:
                params = json.loads(body_bytes)
            except Exception:
                params = {"raw": body_bytes.decode("utf-8", errors="replace")[:500]}
        if dict(request.query_params):
            params = params or {}
            params["_query"] = dict(request.query_params)

        log_action(
            ip=ip,
            user=user,
            action=f"{request.method} {request.url.path}",
            params=params,
        )

    return response


# Tous les routeurs sous /api/v1 (pour que Swagger /docs les affiche)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(clients.router, prefix="/api/v1")
app.include_router(vehicles.router, prefix="/api/v1")
app.include_router(vehicle_details.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(appointment_categories.router, prefix="/api/v1")
app.include_router(appointment_statuses.router, prefix="/api/v1")
app.include_router(employees.router, prefix="/api/v1")
app.include_router(leave_requests.router, prefix="/api/v1")
app.include_router(loan_vehicles.router, prefix="/api/v1")
app.include_router(loan_reservations.router, prefix="/api/v1")
app.include_router(settings.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(bills.router, prefix="/api/v1")
app.include_router(bill_details.router, prefix="/api/v1")
app.include_router(time_cases.router, prefix="/api/v1")
app.include_router(time_case_categories.router, prefix="/api/v1")
app.include_router(workshop.router, prefix="/api/v1")
app.include_router(workshop_planning.router, prefix="/api/v1")
app.include_router(synchronization.router, prefix="/api/v1")
# billing module
app.include_router(vat_rates.router, prefix="/api/v1")
app.include_router(articles.router, prefix="/api/v1")
app.include_router(company_settings.router, prefix="/api/v1")
app.include_router(headers.router, prefix="/api/v1")
app.include_router(billing_documents.router, prefix="/api/v1")
app.include_router(signatures.router, prefix="/api/v1")
app.include_router(invoices.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")
app.include_router(credit_notes.router, prefix="/api/v1")
app.include_router(audit_events.router, prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok"}
