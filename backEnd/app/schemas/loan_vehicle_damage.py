"""Schémas des dégâts d'un véhicule de prêt (migration 025).

Un dégât est attaché au véhicule et localisé par un élément de carrosserie plus
une case dans une grille 3×3 interne à cet élément. Le côté de la voiture est
porté par le code élément lui-même (…Left / …Right), pas par `cellCol`.
"""

from typing import Literal, Optional

from app.schemas.common import CamelModel

# 21 éléments : 7 centraux + 7 par côté. Codes en anglais, libellés français
# côté front (frontEnd/src/lib/loanDamage.ts) et dans le service PDF.
DamageElement = Literal[
    # Centraux
    "bumperFront",
    "hood",
    "windshield",
    "roof",
    "rearWindow",
    "trunk",
    "bumperRear",
    # Côté gauche
    "fenderFrontLeft",
    "doorFrontLeft",
    "windowFrontLeft",
    "windowRearLeft",
    "doorRearLeft",
    "fenderRearLeft",
    "rockerPanelLeft",
    # Côté droit
    "fenderFrontRight",
    "doorFrontRight",
    "windowFrontRight",
    "windowRearRight",
    "doorRearRight",
    "fenderRearRight",
    "rockerPanelRight",
]

DamageRow = Literal["top", "middle", "bottom"]
DamageCol = Literal["left", "center", "right"]
DamageType = Literal["scratch", "dent", "broken", "missing"]


class LoanVehicleDamageBase(CamelModel):
    element: DamageElement
    cellRow: DamageRow
    cellCol: DamageCol
    type: DamageType
    note: Optional[str] = None


class LoanVehicleDamageCreate(LoanVehicleDamageBase):
    pass


class LoanVehicleDamageResponse(LoanVehicleDamageBase):
    id: int
    loanVehicleId: int
