"""Rôle « readonly » (§ 104) : lecture permise, écriture refusée — sans base."""
import pytest
from httpx import ASGITransport, AsyncClient

import app.auth as auth
from app.main import app

LECTEUR = {"id": 42, "login": "lecteur", "role": "readonly"}
GARAGE = {"id": 1, "login": "garage", "role": "garage"}
ENTETES = {"X-Session-Id": "session-de-test"}


@pytest.fixture
def session(monkeypatch):
    """Remplace la recherche de session par un utilisateur fixé ; rien ne touche MySQL."""
    import app.services.log_service as journal

    def poser(user):
        monkeypatch.setattr(auth, "get_user_by_session", lambda sid: user if sid else None)
        monkeypatch.setattr(auth, "delete_session", lambda sid: None)
        # Le journal d'audit écrit sous /app après toute réponse réussie.
        monkeypatch.setattr(journal, "log_action", lambda **kw: None)
    return poser


async def appeler(methode, chemin, **kw):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        return await c.request(methode, chemin, headers=ENTETES, **kw)


@pytest.mark.asyncio
async def test_lecture_permise(session):
    session(LECTEUR)
    r = await appeler("GET", "/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] == "readonly"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "methode, chemin",
    [
        ("POST", "/api/v1/clients"),
        ("PATCH", "/api/v1/clients/1"),
        ("DELETE", "/api/v1/clients/1"),
        ("POST", "/api/v1/appointments"),
        ("POST", "/api/v1/employees"),  # route admin : le refus lecture seule prime
    ],
)
async def test_ecriture_refusee(session, methode, chemin):
    session(LECTEUR)
    r = await appeler(methode, chemin, json={})
    assert r.status_code == 403, r.text
    assert r.json()["code"] == "readOnly"


@pytest.mark.asyncio
async def test_deconnexion_permise(session):
    session(LECTEUR)
    r = await appeler("POST", "/api/v1/auth/logout")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_sans_session_toujours_401(session):
    session(LECTEUR)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/api/v1/clients", json={})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_garage_non_concerne(session):
    """Un compte garage passe la dépendance en écriture ; la 422 vient de la validation, après elle."""
    session(GARAGE)
    r = await appeler("POST", "/api/v1/clients", json={})
    assert r.status_code == 422
