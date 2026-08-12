from typing import Annotated, Optional, Any
from datetime import date
from pydantic import BeforeValidator
from app.schemas.common import CamelModel


def _to_str_or_none(v: Any) -> Optional[str]:
    """Accepte int/float/str; renvoie str ou None. Couvre les cas où le Perl
    encode un champ texte comme nombre (vin tout numérique, taxeType:2, etc.)."""
    if v is None or v == "":
        return None
    return str(v)


# Type à utiliser pour tout champ qui doit être str mais peut arriver en nombre.
LooseStr = Annotated[Optional[str], BeforeValidator(_to_str_or_none)]


def _to_float_or_none(v: Any) -> Optional[float]:
    """Accepte un nombre ou une chaîne (y compris vide) ; renvoie float ou None.
    Couvre les cas où le Perl envoie une chaîne vide au lieu d'omettre le champ."""
    if v is None or v == "":
        return None
    return float(v)


# Type à utiliser pour tout champ numérique qui peut arriver vide ("").
LooseFloat = Annotated[Optional[float], BeforeValidator(_to_float_or_none)]


class UpsertCustomerInput(CamelModel):
    vm_id: Optional[int] = None
    first_name: LooseStr = None
    last_name: LooseStr = None
    postal_code: Optional[Any] = None  # int ou str selon la source
    phone: Optional[Any] = None        # peut avoir un zéro initial → géré en amont
    email: LooseStr = None
    address: LooseStr = None
    city: LooseStr = None
    gender: LooseStr = None
    client_type: LooseStr = None
    vat_number: LooseStr = None
    siren: LooseStr = None


class UpsertCarInput(CamelModel):
    vm_id: Optional[int] = None
    license_plate: LooseStr = None
    brand: LooseStr = None
    model: LooseStr = None
    type: LooseStr = None
    vin: LooseStr = None
    registration_date: LooseStr = None


class UpsertBillHeaderInput(CamelModel):
    bill_id: int
    doc_num: Optional[int] = None
    doc_id: Optional[int] = None
    date_doc: Optional[date] = None
    date_bill: Optional[date] = None
    status: LooseStr = None
    account: Optional[Any] = None  # int ou str selon la source
    type: LooseStr = None


class UpsertHeaderInput(CamelModel):
    customer: UpsertCustomerInput
    car: Optional[UpsertCarInput] = None
    bill: UpsertBillHeaderInput


class UpsertDetailInput(CamelModel):
    type: LooseStr = None
    price_ht: Optional[float] = None
    reference: LooseStr = None
    time: Optional[float] = None
    description: LooseStr = None
    price: Optional[float] = None
    unit_price: LooseStr = None  # billing unit ("heure", "pièce", vide) — not a price
    cash_back: Optional[float] = None
    taxe: LooseFloat = None
    taxe_type: LooseStr = None


class UpsertBillPayload(CamelModel):
    header: UpsertHeaderInput
    detail: list[UpsertDetailInput]


class EntityActionResult(CamelModel):
    action: str  # "found" | "created" | "skipped"
    id: Optional[int] = None


class DetailsSyncResult(CamelModel):
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    unchanged: int = 0


class UpsertBillResponse(CamelModel):
    bill_id: int
    client_id: int
    vehicle_id: Optional[int] = None
    client: EntityActionResult
    vehicle: EntityActionResult
    bill: EntityActionResult
    details: DetailsSyncResult
