from app.schemas.common import CamelModel
from typing import Optional


class SettingBase(CamelModel):
    key: str
    value: Optional[str] = None


class SettingCreate(SettingBase):
    pass


class SettingUpdate(CamelModel):
    value: Optional[str] = None


class SettingResponse(SettingBase):
    id: int
