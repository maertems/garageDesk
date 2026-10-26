from app.schemas.common import CamelModel, telephone_normalise
from app.schemas.vehicle import VehicleResponse
import re
from datetime import datetime
from typing import Optional

from pydantic import field_validator


class ClientBase(CamelModel):
    gender: Optional[str] = None
    firstName: Optional[str] = None
    lastName: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    clientType: str = "individual"
    vatNumber: Optional[str] = None
    siren: Optional[str] = None
    # Numéro de compte comptable, imprimé sur les factures et les avoirs.
    #
    # ATTRIBUÉ PAR LE BACKEND à la création, à partir de 41105001, et modifiable
    # NULLE PART ensuite (voir `services/client_account_service.py`). Déclaré ici
    # pour la LECTURE seule : ce modèle sert aussi aux réponses.
    #
    # Une valeur envoyée à la création est ignorée, et `ClientUpdate` ne porte pas
    # ce champ — un PATCH ne peut donc pas le changer. Masquer le champ à l'écran
    # n'aurait pas suffi : l'API reste joignable directement.
    accountNumber: Optional[str] = None
    vmId: Optional[int] = None


def _espaces(valeur: str) -> str:
    return re.sub(r"\s+", " ", valeur).strip()


def nom_en_majuscules(valeur: Optional[str]) -> Optional[str]:
    """« dupont » → « DUPONT ». Vide ou absent : inchangé."""
    if not valeur or not valeur.strip():
        return valeur
    return _espaces(valeur).upper()


def prenom_capitalise(valeur: Optional[str]) -> Optional[str]:
    """« jEAN-pierre marie » → « Jean-Pierre Marie ».

    Tout en minuscules, puis une majuscule au début de chaque partie : les parties
    sont séparées par une espace ou un tiret, pour les prénoms composés. Vide ou
    absent : inchangé.
    """
    if not valeur or not valeur.strip():
        return valeur
    minuscule = _espaces(valeur).lower()
    return re.sub(r"(^|[ -])([^ -])", lambda m: m.group(1) + m.group(2).upper(), minuscule)


class _NomsNormalises:
    """Nom en majuscules, prénom capitalisé, à l'ÉCRITURE seulement.

    Posé sur les schémas de création et de modification, pas sur la réponse : les
    fiches déjà en base sont rendues telles quelles. La règle vaut pour tout appel
    de l'API, donc pour tous les formulaires qui créent un client.
    """

    @field_validator("lastName", mode="after", check_fields=False)
    @classmethod
    def _last_name(cls, v):
        return nom_en_majuscules(v)

    @field_validator("firstName", mode="after", check_fields=False)
    @classmethod
    def _first_name(cls, v):
        return prenom_capitalise(v)

    # Téléphone collé, chiffres et « + » initial seulement (§ 101).
    @field_validator("phone", mode="after", check_fields=False)
    @classmethod
    def _phone(cls, v):
        return telephone_normalise(v)


class ClientCreate(_NomsNormalises, ClientBase):
    pass


class ClientUpdate(_NomsNormalises, CamelModel):
    gender: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    postalCode: Optional[str] = None
    city: Optional[str] = None
    clientType: Optional[str] = None
    vatNumber: Optional[str] = None
    siren: Optional[str] = None
    vmId: Optional[int] = None


class ClientResponse(ClientBase):
    id: int
    # Date d'enregistrement, pour la liste des clients (derniers enregistrés en
    # tête). Optionnelle : les réponses construites sans relire la ligne n'en ont pas.
    createdAt: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ClientWithVehiclesResponse(ClientResponse):
    vehicles: list[VehicleResponse] = []
