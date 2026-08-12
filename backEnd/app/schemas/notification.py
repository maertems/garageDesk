from app.schemas.common import CamelModel
from typing import Optional, Literal


EndpointType = Literal["email", "sms"]


class NotificationEndpointBase(CamelModel):
    type: EndpointType
    base_url: str
    sort_order: int = 0
    active: bool = True


class NotificationEndpointCreate(NotificationEndpointBase):
    pass


class NotificationEndpointUpdate(CamelModel):
    type: Optional[EndpointType] = None
    base_url: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None


class NotificationEndpointResponse(NotificationEndpointBase):
    id: int


class NotificationSettingsResponse(CamelModel):
    """Paramètres de notification (lecture)."""
    notification_on_create: bool = False
    notification_reminder_days_before: int = 1
    notification_reminder_time: str = "19:00"  # HH:MM
    notification_message_on_create: str = ""
    notification_message_reminder: str = ""


class NotificationSettingsUpdate(CamelModel):
    notification_on_create: Optional[bool] = None
    notification_reminder_days_before: Optional[int] = None
    notification_reminder_time: Optional[str] = None
    notification_message_on_create: Optional[str] = None
    notification_message_reminder: Optional[str] = None
