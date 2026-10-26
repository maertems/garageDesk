import re
from datetime import datetime
from typing import Annotated, Any, Generic, Optional, TypeVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, field_validator
from pydantic_core import PydanticCustomError


# ── Types tolérants ──────────────────────────────────────────────────────────
# Les sources extérieures — le script Perl du garage, mais aussi n'importe quel
# client HTTP — envoient volontiers une CHAÎNE VIDE au lieu d'omettre un champ, et
# encodent parfois un texte comme un nombre. Un `Optional[float]` ou un
# `Optional[int]` refuse alors la valeur, et FastAPI rejette la requête entière en
# 422 : une seule cellule vide fait perdre toute une facture.
#
# Ces trois annotations vivent ici, et non dans un module de schéma particulier,
# parce que la synchronisation ET l'API manuelle en ont besoin. Une définition
# unique, sinon l'un des deux chemins finit par oublier la tolérance — ce qui est
# exactement arrivé au champ `time`.


def _to_str_or_none(v: Any) -> Optional[str]:
    """Accepte int/float/str ; renvoie str ou None.

    Couvre les champs texte encodés comme nombres par la source (un VIN tout
    numérique, `taxeType: 2`), et les champs polymorphes comme `time`, qui porte
    un nombre d'heures, une quantité, ou une unité de mesure en clair.
    """
    if v is None or v == "":
        return None
    return str(v)


def _to_float_or_none(v: Any) -> Optional[float]:
    """Accepte un nombre ou une chaîne (y compris vide) ; renvoie float ou None."""
    if v is None or v == "":
        return None
    return float(v)


def _to_int_or_none(v: Any) -> Optional[int]:
    """Accepte un entier ou une chaîne (y compris vide) ; renvoie int ou None.

    Indispensable sur les `vmId` : un document sans voiture arrive avec
    `car: {"vmId": "", ...}`, et `Optional[int]` refusait la chaîne vide — la
    facture ENTIÈRE était alors rejetée, avant tout traitement. Le symptôme ne
    ressemblait pas à sa cause : on croyait à un rattachement de véhicule erroné,
    alors que le document n'entrait jamais.
    """
    if v is None or v == "":
        return None
    return int(v)


#: Champ qui doit être str mais peut arriver en nombre, ou vide.
LooseStr = Annotated[Optional[str], BeforeValidator(_to_str_or_none)]
#: Champ numérique qui peut arriver vide ("").
LooseFloat = Annotated[Optional[float], BeforeValidator(_to_float_or_none)]
#: Identifiant entier qui peut arriver vide ("").
LooseInt = Annotated[Optional[int], BeforeValidator(_to_int_or_none)]


def serialize_datetime_iso_utc(dt: datetime) -> str:
    """Sérialise en ISO avec Z. Naive = considéré UTC (stockage), le front convertit en local pour l'affichage."""
    s = dt.isoformat()
    if dt.tzinfo is None:
        return s + "Z"
    return s.replace("+00:00", "Z") if s.endswith("+00:00") else s


class ErrorResponse(BaseModel):
    model_config = ConfigDict(alias_generator=lambda s: s)
    code: str
    message: str


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        from_attributes=True,
    )


# Seuls lettres, chiffres, tiret et espace sont admis dans une plaque.
_PLAQUE_AUTORISEE = re.compile(r"^[A-Za-z0-9\-\s]+$")
# Format SIV (depuis 2009), séparateurs retirés : AB123CD → AB-123-CD.
_PLAQUE_SIV = re.compile(r"^([A-Z]{2})(\d{3})([A-Z]{2})$")
# Ancien format FNI, séparateurs retirés : 12AZE59 → 12 AZE 59. Le département
# final est un nombre, ou 2A / 2B pour la Corse : 1234AB2A → 1234 AB 2A.
_PLAQUE_FNI = re.compile(r"^(\d{1,4})([A-Z]{1,3})(\d{2,3}|2A|2B)$")

PLAQUE_MESSAGE = "Plaque d'immatriculation : seuls les lettres, les chiffres, le tiret et l'espace sont acceptés."


def plaque_normalisee(valeur: Optional[str]) -> Optional[str]:
    """Plaque en majuscules, au format officiel quand il est reconnu.

    - « ab123cd », « AB 123 CD », « ab-123-cd » → « AB-123-CD » (SIV, tirets) ;
    - « 12aze59 », « 12 AZE 59 » → « 12 AZE 59 » (FNI, espaces), Corse comprise
      (« 1234ab2a » → « 1234 AB 2A ») ;
    - autre chose (plaque étrangère, garage…) : espaces resserrées, majuscules ;
    - un caractère hors lettres, chiffres, tiret, espace : refusé (422) ;
    - vide ou absent : inchangé.
    """
    if not valeur or not valeur.strip():
        return valeur
    if not _PLAQUE_AUTORISEE.match(valeur):
        raise PydanticCustomError("license_plate", PLAQUE_MESSAGE)
    compact = re.sub(r"[\s-]", "", valeur).upper()
    m = _PLAQUE_SIV.match(compact)
    if m:
        return "-".join(m.groups())
    m = _PLAQUE_FNI.match(compact)
    if m:
        return " ".join(m.groups())
    return re.sub(r"\s+", " ", valeur).strip().upper()


def texte_en_majuscules(valeur: Optional[str]) -> Optional[str]:
    """Espaces resserrées, majuscules. Vide ou absent : inchangé. Sert au VIN."""
    if not valeur or not valeur.strip():
        return valeur
    return re.sub(r"\s+", " ", valeur).strip().upper()


class PlaqueNormalisee:
    """Plaque d'immatriculation normalisée (`plaque_normalisee`), à l'ÉCRITURE seulement.

    À poser sur les schémas de création et de modification qui portent
    `licensePlate` (véhicules des clients, véhicules de prêt), pas sur les
    réponses : les lignes déjà en base sont rendues telles quelles.
    """

    @field_validator("licensePlate", mode="after", check_fields=False)
    @classmethod
    def _license_plate(cls, v):
        return plaque_normalisee(v)


T = TypeVar("T")


class PageResponse(CamelModel, Generic[T]):
    """Une page d'une liste paginée côté serveur.

    Les listes (clients, véhicules, documents) rendaient leur table ENTIÈRE —
    5 125 documents et 1,5 Mo pour en afficher vingt. Quand l'appelant passe
    `limit`, il reçoit cette enveloppe : la page demandée et le nombre total de
    lignes qui répondent au filtre, pour le compteur et la pagination. Sans
    `limit`, la réponse reste la liste nue qu'attendent les autres appelants.
    """

    items: list[T]
    total: int


# Borne haute d'une page : au-delà, on retombe sur le téléchargement complet
# qu'on cherche justement à éviter.
PAGE_LIMIT_MAX = 200
