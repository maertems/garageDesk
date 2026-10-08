"""Attribution automatique de nos numéros de compte client.

Le garage ne veut plus les saisir : le backend les attribue, à partir de
**41105001** — valeur choisie pour ne pas entrer en collision avec les comptes du
système de facturation actuel, qui vont de 41101159 à 41102416 (plus un collectif
isolé à 41190000).

Aucune base ici : le curseur est remplacé. Ce qui est vérifié, c'est la RÈGLE de
numérotation et le fait que la requête réserve bien son verrou.
"""
import pytest

from app.services.client_account_service import PREMIER_COMPTE, prochain_numero_de_compte


class FauxCurseur:
    """Curseur minimal : retient la dernière requête et rend un MAX imposé."""

    def __init__(self, maxi):
        self._maxi = maxi
        self.derniere_requete = ""

    def execute(self, requete, *a, **k):
        self.derniere_requete = requete

    def fetchone(self):
        return {"maxi": self._maxi}


def test_le_premier_compte_est_41105001():
    """Valeur imposée par le garage, pour ne pas heurter l'existant."""
    assert prochain_numero_de_compte(FauxCurseur(None)) == "41105001"
    assert PREMIER_COMPTE == 41105001


def test_le_suivant_incremente_de_un():
    assert prochain_numero_de_compte(FauxCurseur(41105001)) == "41105002"
    assert prochain_numero_de_compte(FauxCurseur(41106136)) == "41106137"


def test_un_numero_sous_le_plancher_ne_fait_pas_reculer_la_serie():
    """Garde-fou contre une saisie manuelle maladroite.

    Si quelqu'un corrigeait une fiche avec un numéro du système actuel — 41101518,
    par exemple —, en déduire `+1` donnerait 41101519 et marcherait sur ses
    plates-bandes. Le plancher reprend la main.
    """
    assert prochain_numero_de_compte(FauxCurseur(41101518)) == "41105001"
    assert prochain_numero_de_compte(FauxCurseur(1)) == "41105001"


def test_le_numero_est_rendu_en_texte():
    """La colonne est un VARCHAR(32) : un entier s'y écrirait, mais le reste du
    code manipule des chaînes et un aller-retour implicite finirait par surprendre.
    """
    assert isinstance(prochain_numero_de_compte(FauxCurseur(41105001)), str)


def test_la_requete_reserve_son_verrou():
    """Sans `FOR UPDATE`, deux créations simultanées lisent le même MAX et
    reçoivent le même numéro. C'est le défaut que ce test garde.
    """
    cur = FauxCurseur(None)
    prochain_numero_de_compte(cur)
    assert "FOR UPDATE" in cur.derniere_requete.upper()


def test_la_requete_ignore_les_valeurs_non_numeriques():
    """`bills.account` mélange des numéros et des libellés (« CLIENTS DIVERS X Y
    Z »). Si pareille valeur atterrissait un jour ici, `CAST(... AS UNSIGNED)` la
    lirait 0 — inoffensif — mais la série ne doit de toute façon considérer que
    les numéros.
    """
    cur = FauxCurseur(None)
    prochain_numero_de_compte(cur)
    assert "REGEXP" in cur.derniere_requete.upper()


def test_la_creation_n_accepte_pas_de_numero_impose():
    """La route ne doit JAMAIS reprendre `data.accountNumber` à la création.

    On lit le source : c'est le seul moyen sans base, et l'invariant est simple —
    la valeur insérée est celle du service, pas celle de la charge.
    """
    import inspect

    from app.routers import clients

    source = inspect.getsource(clients.create_client)
    assert "prochain_numero_de_compte" in source, "le numéro doit venir du service"
    assert "data.accountNumber" not in source, (
        "la charge ne doit pas pouvoir imposer un numéro à la création"
    )


def test_la_creation_tient_une_transaction():
    """`db_cursor` ouvre une connexion par bloc : le `FOR UPDATE` serait relâché
    avant l'insertion, et le verrou ne servirait à rien.
    """
    import inspect

    from app.routers import clients

    source = inspect.getsource(clients.create_client)
    assert "db_transaction" in source


def test_la_modification_ne_peut_pas_changer_le_numero():
    """Le numéro n'est modifiable NULLE PART, décision du garage.

    Masquer le champ à l'écran n'aurait pas suffi : l'API reste joignable
    directement. `ClientUpdate` ne porte donc pas ce champ, et Pydantic ignore en
    silence ce qu'il ne déclare pas — un PATCH qui l'enverrait n'a aucun effet.
    """
    from app.schemas.client import ClientUpdate

    assert "accountNumber" not in ClientUpdate.model_fields

    envoye = ClientUpdate(accountNumber="41105999", city="Lille")
    retenu = envoye.model_dump(exclude_unset=True)
    assert "accountNumber" not in retenu, "le numéro ne doit jamais atteindre le UPDATE"
    assert retenu == {"city": "Lille"}, "le reste de la modification passe normalement"


def test_la_lecture_rend_toujours_le_numero():
    """Non modifiable ne veut pas dire invisible : la fiche et les factures
    l'affichent.
    """
    from app.schemas.client import ClientResponse

    assert "accountNumber" in ClientResponse.model_fields
