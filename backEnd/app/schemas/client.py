from app.schemas.common import CamelModel
from app.schemas.vehicle import VehicleResponse
from typing import Optional


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


class ClientCreate(ClientBase):
    pass


class ClientUpdate(CamelModel):
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

    model_config = {"from_attributes": True}


class ClientWithVehiclesResponse(ClientResponse):
    vehicles: list[VehicleResponse] = []
