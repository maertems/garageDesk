import time
import urllib.parse
import httpx

_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0"

_cached_cookie: str = ""
_cookie_expiry: float = 0.0


def _get_session_cookie() -> str:
    global _cached_cookie, _cookie_expiry
    if _cached_cookie and time.time() < _cookie_expiry:
        return _cached_cookie
    r = httpx.get(
        "https://www.vroomly.com/",
        headers={"User-Agent": _UA},
        follow_redirects=True,
        timeout=10,
    )
    _cached_cookie = "; ".join(f"{k}={v}" for k, v in r.cookies.items())
    _cookie_expiry = time.time() + 23 * 3600
    return _cached_cookie


def _do_lookup(plate: str, cookie: str) -> tuple[bool, dict]:
    url = (
        "https://www.vroomly.com/api/v1/vehicleselecter/vehicle/from_identifier/"
        f"?vehicleIdentifier={urllib.parse.quote(plate)}"
        "&vehicleIdentifierType=vplate&setInSession=true"
    )
    r = httpx.get(url, headers={"User-Agent": _UA, "Cookie": cookie}, timeout=10)
    data = r.json()
    ok = r.status_code == 200 and data.get("status") != 400
    return ok, data


def lookup_plate(plate: str) -> dict:
    """
    Retourne l'un des cas suivants :
      {"found": True,  "brand": ..., "model": ..., "type": ..., "registrationDate": ..., "vin": ...}
        → plaque trouvée ; registrationDate = "1111-11-11" si vroomly n'a pas la date
      {"found": False}
        → plaque inconnue de vroomly (appel OK, plaque absente)
      {"error": True}
        → problème réseau / communication : stocker null en base, à compléter plus tard
    """
    global _cached_cookie
    try:
        cookie = _get_session_cookie()
        ok, data = _do_lookup(plate, cookie)

        if not ok:
            # Session peut-être expirée — on force une nouvelle initialisation
            _cached_cookie = ""
            cookie = _get_session_cookie()
            ok, data = _do_lookup(plate, cookie)

        if not ok:
            return {"found": False}

        reg_date = data.get("registrationDate") or None
        if reg_date is None:
            # Appel réussi mais pas de date disponible → code sentinel
            reg_date = "1111-11-11"

        return {
            "found": True,
            "brand": data.get("manufacturer") or None,
            "model": data.get("model") or None,
            "type": data.get("type") or None,
            "registrationDate": reg_date,
            "vin": data.get("vin") or None,
        }
    except Exception:
        # Erreur réseau : null = "à compléter plus tard"
        return {"error": True}
