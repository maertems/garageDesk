# GarageDesk

Intranet de gestion pour garage automobile (calendrier, clients, véhicules, salariés, congés, véhicules de prêt, facturation).
Backend API Python (FastAPI) + Frontend Next.js. Base MySQL externe.

> Le nom affiché dans l'application (sidebar, page de connexion) est personnalisable par déploiement via la variable `APP_NAME` — voir `backEnd/.env.example` et `frontEnd/.env.example`.

## Prérequis

- **MySQL 8+** (serveur accessible, base créée)
- **Docker** (pour exécuter backend et frontend en conteneurs)
- Ou : Python 3.10+, Node.js 18+ pour lancer sans Docker

## Architecture

| Composant   | Port exposé | Description                    |
|------------|-------------|---------------------------------|
| Backend API| 7780        | FastAPI, Swagger sur `/docs`   |
| Frontend   | 8080        | Next.js, interface utilisateur  |
| MySQL      | 3306        | Externe (hôte à configurer)     |

Le frontend appelle l’API **uniquement via son serveur** (proxy). La variable `BACKEND_URL` doit pointer vers l’URL du backend **telle que vue par le serveur frontend** (voir ci‑dessous).

## Mise en place (ordre recommandé)

### 1. Base MySQL

Créer une base (ex. `garagedesk`) puis exécuter :

```bash
cd backEnd
mysql -h VOTRE_HOST -u VOTRE_USER -p VOTRE_BASE < sql/schema.sql
mysql -h VOTRE_HOST -u VOTRE_USER -p VOTRE_BASE < sql/seed.sql
MYSQL_HOST=VOTRE_HOST MYSQL_USER=VOTRE_USER MYSQL_PASSWORD=VOTRE_PASSWORD MYSQL_DATABASE=VOTRE_BASE python3 scripts/seed_users.py
```

Utilisateurs initiaux : **garage** / **garage**, **admin** / **admin** (rôle admin = dirigeant).

### 2. Backend (Docker)

```bash
cd backEnd
docker build -t gd-api .
docker run -d -p 7780:80 \
  -e MYSQL_HOST=votre-hôte-mysql \
  -e MYSQL_USER=votre-user \
  -e MYSQL_PASSWORD=votre-password \
  -e MYSQL_DATABASE=nom-de-la-base \
  --name gd-backend \
  gd-api
```

- API : `http://<IP-MACHINE>:7780`
- Swagger : `http://<IP-MACHINE>:7780/docs`

### 3. Frontend (Docker)

**Important :** `BACKEND_URL` doit être l’URL du backend **telle que le conteneur frontend peut y accéder**.

- Backend et frontend sur la **même machine** :
  - Sous Linux : utiliser l’**IP de la machine** (ex. `192.168.1.10`) ou `host.docker.internal` avec `--add-host=host.docker.internal:host-gateway`.
  - Exemple : `BACKEND_URL=http://192.168.1.10:7780`
- Backend sur une **autre machine** : `BACKEND_URL=http://<IP-BACKEND>:7780`

```bash
cd frontEnd
docker build -t gd-frontend .
docker run -d -p 8080:80 \
  -e BACKEND_URL=http://<IP-DU-BACKEND>:7780 \
  --name gd-frontend \
  gd-frontend
```

Si erreur 500 sur la page de connexion, vérifier que le frontend peut joindre le backend (même réseau, firewall, et `BACKEND_URL` correct).

- Interface : `http://<IP-MACHINE>:8080`  
- Connexion : **garage** / **garage** ou **admin** / **admin**

## Sans Docker

- **Backend :** `cd backEnd && pip install -r requirements.txt && uvicorn app.main:app --host 0.0.0.0 --port 7780` (avec variables `MYSQL_*`).
- **Frontend :** `cd frontEnd && npm install && BACKEND_URL=http://localhost:7780 npm run dev` (port 3000).

## Documentation détaillée

- [backEnd/README.md](backEnd/README.md) — API, variables d’environnement, tests, Docker
- [frontEnd/README.md](frontEnd/README.md) — Configuration, développement, Docker, fichier de libellés
- [backEnd/docs/API_EXAMPLES.md](backEnd/docs/API_EXAMPLES.md) — Exemples d’appels API

## Licence / usage

Projet interne. À adapter (credentials, noms) selon l’environnement de déploiement.
