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
    # Envoi des rappels de RDV par l'ordonnanceur interne. Il faut la mettre
    # explicitement à 1 sur l'instance qui doit les envoyer.
    #
    # Défaut à FAUX, y compris quand la variable est absente. Les deux façons
    # d'échouer ne se valent pas : oublier la variable sur une instance de secours
    # enverrait un second SMS à chaque client, ce qui est irréversible, alors que
    # l'oublier en production ne fait que suspendre les rappels — détectable et
    # réparable. Et l'oubli en production se voit tout de suite, le coin haut
    # gauche de l'interface passant au rouge.
    #
    # Volontairement PAS stocké en base : la base de secours étant une copie de la
    # production, elle hériterait de la valeur « activé ».
    schedulerEnabled: bool = Field(default=False, validation_alias="SCHEDULER_ENABLED")

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
