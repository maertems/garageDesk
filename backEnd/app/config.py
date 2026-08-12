from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Nom affiché de l'application (titre Swagger, marque frontend) — pour un
    # déploiement en marque blanche, sans toucher au code.
    appName: str = Field(default="GarageDesk", validation_alias="APP_NAME")
    host: str = Field(default="localhost", validation_alias="MYSQL_HOST")
    port: int = Field(default=3306, validation_alias="MYSQL_PORT")
    user: str = Field(default="root", validation_alias="MYSQL_USER")
    password: str = Field(default="", validation_alias="MYSQL_PASSWORD")
    database: str = Field(default="garagedesk", validation_alias="MYSQL_DATABASE")
    sessionCookieName: str = "sessionId"
    sessionHeaderName: str = "X-Session-Id"
    sessionLifetimeSeconds: int = 86400 * 7  # 7 days
    # Fuseau horaire pour l'affichage des heures dans les notifications (SMS/email). Les RDV sont stockés en UTC.
    displayTimezone: str = Field(default="Europe/Paris", validation_alias="DISPLAY_TIMEZONE")
    # Répertoire des fichiers de log (actions.log, notifications.log)
    logsDir: str = Field(default="/app/logs", validation_alias="LOGS_DIR")

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
