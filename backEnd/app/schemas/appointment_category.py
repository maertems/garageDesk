from typing import Optional

from app.schemas.common import CamelModel


class AppointmentCategoryBase(CamelModel):
    code: str
    # Libellé affiché, en base depuis la migration 032. Il vivait dans
    # `frontEnd/src/lib/labels.ts`, donc dans le code : créer une entrée depuis un
    # écran l'aurait affichée sous son code anglais. `labels.ts` ne sert plus que
    # de repli pour les entrées d'origine.
    label: Optional[str] = None
    color: Optional[str] = None
    # Ordre d'affichage. Le tri alphabétique du code anglais proposait
    # Carrosserie avant Mécanique. Valeurs espacées de dix : une entrée
    # intercalée plus tard ne force pas à renuméroter les autres.
    sortOrder: int = 0


class AppointmentCategoryCreate(AppointmentCategoryBase):
    pass


class AppointmentCategoryUpdate(CamelModel):
    code: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None
    sortOrder: Optional[int] = None


class AppointmentCategoryResponse(AppointmentCategoryBase):
    id: int
