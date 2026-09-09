from datetime import datetime
from typing import Annotated, Any, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict


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
