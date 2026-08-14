#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Identifiants chargés depuis deploy.env (non suivi par git — voir deploy.env.example)
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
  set -a
  source "$SCRIPT_DIR/deploy.env"
  set +a
fi

: "${MYSQL_HOST:?MYSQL_HOST manquant — copier deploy.env.example en deploy.env et le renseigner}"
: "${MYSQL_USER:?MYSQL_USER manquant — copier deploy.env.example en deploy.env et le renseigner}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD manquant — copier deploy.env.example en deploy.env et le renseigner}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE manquant — copier deploy.env.example en deploy.env et le renseigner}"
BACKEND_PORT="${BACKEND_PORT:-7780}"
APP_NAME="${APP_NAME:-GarageDesk}"

cd "$SCRIPT_DIR/backEnd"

# Identifiant de l'image en service, relevé avant reconstruction : c'est lui
# qu'on retirera à la fin. Un `docker image prune` généraliste supprimerait
# aussi les images sans tag des autres projets de la machine.
OLD_IMAGE="$(sudo docker images -q gd-api 2>/dev/null | head -1)"

# Construction AVANT de toucher au conteneur en service : un build qui échoue
# laisse l'ancienne version en ligne. L'ordre inverse (stop / rm / rmi puis
# build) laissait l'API arrêtée ET l'image supprimée en cas d'échec.
if ! sudo docker build -t gd-api .; then
  echo "updateBack : build échoué — le conteneur en service n'a pas été touché." >&2
  exit 1
fi

# Le conteneur tourne encore sur l'ancienne image, qui vient de perdre son tag
# au profit de la nouvelle : on l'arrête et on le retire maintenant seulement.
sudo docker stop gd-backend 2>/dev/null
sudo docker rm gd-backend 2>/dev/null

sudo docker run -d -p "${BACKEND_PORT}:80" \
  -e MYSQL_HOST="$MYSQL_HOST" \
  -e MYSQL_USER="$MYSQL_USER" \
  -e MYSQL_PASSWORD="$MYSQL_PASSWORD" \
  -e MYSQL_DATABASE="$MYSQL_DATABASE" \
  -e APP_NAME="$APP_NAME" \
  --name gd-backend \
  gd-api

# L'ancienne image a perdu son tag au profit de la nouvelle et n'a plus de
# conteneur : sans ce retrait, un exemplaire s'accumulerait à chaque
# déploiement. Après le `docker rm` ci-dessus, sinon elle compte comme utilisée.
# Le test d'égalité couvre le cas où le build n'a rien changé (cache) : l'image
# est alors la même, il ne faut surtout pas la supprimer.
NEW_IMAGE="$(sudo docker images -q gd-api 2>/dev/null | head -1)"
if [ -n "$OLD_IMAGE" ] && [ "$OLD_IMAGE" != "$NEW_IMAGE" ]; then
  sudo docker rmi "$OLD_IMAGE" 2>/dev/null
fi

cd ..
