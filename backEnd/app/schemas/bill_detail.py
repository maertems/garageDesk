from typing import Optional

from app.schemas.common import CamelModel, LooseStr


class BillDetailBase(CamelModel):
    billId: int
    type: Optional[str] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    # Texte depuis la migration 029 : nombre d'heures, quantité de pièces, ou
    # unité de mesure en clair (« au metre »). `LooseStr` et non `Optional[str]` :
    # Pydantic ne convertit PAS un nombre en chaîne, et un client qui enverrait
    # `time: 2` — parfaitement légitime — se verrait refusé.
    # `timeEquivalentT1` reste numérique, étant calculé et seulement quand `time`
    # se lit comme un nombre.
    time: LooseStr = None
    timeEquivalentT1: Optional[float] = None
    priceHT: Optional[float] = None
    price: Optional[float] = None
    unitPrice: Optional[str] = None
    taxeType: Optional[str] = None
    taxe: Optional[float] = None
    cashBack: Optional[float] = None


class BillDetailCreate(BillDetailBase):
    pass


class BillDetailUpdate(CamelModel):
    type: Optional[str] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    # Texte depuis la migration 029 : nombre d'heures, quantité de pièces, ou
    # unité de mesure en clair (« au metre »). `LooseStr` et non `Optional[str]` :
    # Pydantic ne convertit PAS un nombre en chaîne, et un client qui enverrait
    # `time: 2` — parfaitement légitime — se verrait refusé.
    # `timeEquivalentT1` reste numérique, étant calculé et seulement quand `time`
    # se lit comme un nombre.
    time: LooseStr = None
    timeEquivalentT1: Optional[float] = None
    priceHT: Optional[float] = None
    price: Optional[float] = None
    unitPrice: Optional[str] = None
    taxeType: Optional[str] = None
    taxe: Optional[float] = None
    cashBack: Optional[float] = None


class BillDetailResponse(BillDetailBase):
    id: int
