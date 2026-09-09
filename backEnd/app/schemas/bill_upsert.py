from typing import Any, Optional
from datetime import date

from app.schemas.common import CamelModel, LooseFloat, LooseInt, LooseStr

class UpsertCustomerInput(CamelModel):
    vm_id: LooseInt = None
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
    vm_id: LooseInt = None
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
    price_ht: LooseFloat = None
    reference: LooseStr = None
    # Champ POLYMORPHE dans la source : un nombre d'heures, une quantité de
    # pièces, ou une unité de mesure en clair (« au metre »). Il est donc reçu et
    # stocké comme du TEXTE — la colonne est passée de FLOAT(5,2) à VARCHAR par la
    # migration 029. Un `Optional[float]` refusait « au metre » ET la chaîne vide,
    # ce qui rejetait la facture entière en 422.
    #
    # Ce qui reste numérique : `timeEquivalentT1`, calculé seulement quand cette
    # valeur se lit comme un nombre.
    time: LooseStr = None
    description: LooseStr = None
    price: LooseFloat = None
    unit_price: LooseStr = None  # billing unit ("heure", "pièce", vide) — not a price
    cash_back: LooseFloat = None
    taxe: LooseFloat = None
    taxe_type: LooseStr = None


class UpsertBillPayload(CamelModel):
    header: UpsertHeaderInput
    detail: list[UpsertDetailInput]


class EntityActionResult(CamelModel):
    # Quatre valeurs, et la distinction compte pour le script appelant :
    #   found    — retrouvé par son vmId, l'ancrage existait déjà
    #   matched  — rapproché par score et FUSIONNÉ : il portait nos données, il porte
    #              désormais aussi le vmId
    #   created  — aucun candidat convaincant, enregistrement neuf
    #   skipped  — rien n'a été tenté (aucun véhicule dans la charge)
    action: str
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
