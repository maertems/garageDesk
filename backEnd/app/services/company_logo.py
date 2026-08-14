"""Logo de l'entreprise (migration 026).

Lecture partagée par les trois générateurs de PDF (facture, avoir, contrat de
prêt) et par le routeur companySettings.

Le logo n'est jamais renvoyé dans le JSON de `GET /companySettings` : des octets
binaires n'y ont pas leur place, et la réponse est chargée à chaque affichage de
la page Paramètres. Seul un booléen `hasLogo` y figure ; l'image elle-même se
récupère sur `GET /companySettings/logo`.
"""

from app.database import db_cursor

# Formats acceptés au téléversement. reportlab sait décoder PNG et JPEG via PIL ;
# le SVG n'est pas géré (il faudrait un rasteriseur) et serait refusé en 415.
ALLOWED_MIME_TYPES = ("image/png", "image/jpeg")

# Plafond du téléversement. Un logo de papier à en-tête pèse quelques dizaines de
# kilo-octets ; 2 Mo laissent de la marge à une image non optimisée tout en
# évitant qu'une photo d'appareil parte en base et dans chaque PDF.
MAX_LOGO_BYTES = 2 * 1024 * 1024


def fetch_logo() -> bytes | None:
    """Octets du logo, ou None s'il n'y en a pas.

    Les générateurs de PDF l'appellent sans se soucier de l'absence de logo :
    `draw_logo` ne dessine rien quand elle reçoit None, et le document reste
    identique à ce qu'il était avant cette fonctionnalité.
    """
    with db_cursor() as cur:
        cur.execute("SELECT logo FROM companySettings WHERE id = 1")
        row = cur.fetchone()
    if not row:
        return None
    return row.get("logo") or None
