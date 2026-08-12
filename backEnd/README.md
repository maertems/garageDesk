# WPSCLS Intranet – Backend

API REST Python (FastAPI), MySQL, authentification par session.  
Documentation exploitable pour déploiement (y compris via GitHub).

## Prérequis

- Python 3.10+
- MySQL 8+ (serveur accessible)
- Optionnel : client MySQL en ligne de commande pour appliquer les scripts SQL

## Variables d’environnement

| Variable         | Description                                           | Défaut      |
|------------------|-------------------------------------------------------|-------------|
| MYSQL_HOST       | Hôte MySQL                                            | localhost   |
| MYSQL_PORT       | Port MySQL                                            | 3306        |
| MYSQL_USER       | Utilisateur MySQL                                     | root        |
| MYSQL_PASSWORD   | Mot de passe MySQL                                    | (vide)      |
| MYSQL_DATABASE   | Nom de la base                                        | wpscls      |
| DISPLAY_TIMEZONE | Fuseau pour les heures dans les notifications (SMS/email) | Europe/Paris |

## Base de données

1. **Créer la base** (si besoin) :
   ```bash
   mysql -h HOST -u USER -p -e "CREATE DATABASE IF NOT EXISTS nom_base CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

2. **Créer les tables et charger les données initiales** :
   ```bash
   mysql -h HOST -u USER -p NOM_BASE < sql/schema.sql
   mysql -h HOST -u USER -p NOM_BASE < sql/seed.sql
   ```

3. **Insérer les utilisateurs** (mots de passe hashés bcrypt) :
   ```bash
   MYSQL_HOST=HOST MYSQL_USER=USER MYSQL_PASSWORD=PASSWORD MYSQL_DATABASE=NOM_BASE python3 scripts/seed_users.py
   ```

Utilisateurs créés : **garage** / **garage**, **admin** / **admin**. Ne pas stocker de mots de passe en clair.

## Installation et lancement (sans Docker)

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 80
```

- API : `http://localhost/api/v1/`
- Swagger : `http://localhost/docs`
- ReDoc : `http://localhost/redoc`

## Docker (sans docker-compose)

L’image n’inclut pas MySQL ; la base doit être accessible via les variables d’environnement.

**Build :**
```bash
docker build -t gd-api .
```

**Run** (exposer l’API sur le port **7780** de l’hôte) :
```bash
docker run -d -p 7780:80 \
  -e MYSQL_HOST=votre-hôte-mysql \
  -e MYSQL_USER=votre-user \
  -e MYSQL_PASSWORD=votre-password \
  -e MYSQL_DATABASE=nom-de-la-base \
  --name gd-backend \
  gd-api
```

- API : `http://localhost:7780` (ou `http://<IP>:7780`)
- Swagger : `http://localhost:7780/docs`

**Arrêter / supprimer le conteneur :**
```bash
docker stop gd-backend
docker rm gd-backend
```

## Tests

Les tests d’intégration nécessitent une base MySQL (schéma + seed + utilisateurs appliqués).

```bash
export MYSQL_HOST=... MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DATABASE=...
pytest tests/ -v
```

Sans base configurée, une partie des tests (auth, erreurs, health) peut être exécutée ; les autres échoueront sur la connexion MySQL.

Avec rapport de couverture :
```bash
pytest tests/ --cov=app --cov-report=term-missing
```

## Spécification OpenAPI

- En cours d’exécution : `GET /openapi.json`, `GET /docs` (Swagger).
- Export fichier : `python3 scripts/dump_openapi.py` (génère `openapi.json` à la racine de backEnd).

Exemples d’appels : [docs/API_EXAMPLES.md](docs/API_EXAMPLES.md).
