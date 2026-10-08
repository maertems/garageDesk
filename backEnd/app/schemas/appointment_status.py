from typing import Optional

from app.schemas.common import CamelModel


class AppointmentStatusBase(CamelModel):
    code: str
    # Libellé affiché, en base depuis la migration 032. Il vivait dans
    # `frontEnd/src/lib/labels.ts`, donc dans le code : créer une entrée depuis un
    # écran l'aurait affichée sous son code anglais. `labels.ts` ne sert plus que
    # de repli pour les entrées d'origine.
    label: Optional[str] = None
    color: Optional[str] = None
    # Ordre d'affichage. Le tri alphabétique du code anglais proposait
    # « Commande faite » avant « Commande à passer ». Valeurs espacées de dix : une entrée
    # intercalée plus tard ne force pas à renuméroter les autres.
    sortOrder: int = 0


class AppointmentStatusCreate(AppointmentStatusBase):
    pass


class AppointmentStatusUpdate(CamelModel):
    code: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None
    sortOrder: Optional[int] = None


class AppointmentStatusResponse(AppointmentStatusBase):
    id: int
