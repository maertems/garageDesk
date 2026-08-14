#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Hôte du backend chargé depuis deploy.env (non suivi par git — voir deploy.env.example)
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
  set -a
  source "$SCRIPT_DIR/deploy.env"
  set +a
fi

: "${BACKEND_HOST:?BACKEND_HOST manquant — copier deploy.env.example en deploy.env et le renseigner}"
BACKEND_PORT="${BACKEND_PORT:-7780}"
FRONTEND_PORT="${FRONTEND_PORT:-8081}"
APP_NAME="${APP_NAME:-GarageDesk}"

cd "$SCRIPT_DIR/frontEnd"

# Identifiant de l'image en service, relevé avant reconstruction : c'est lui
# qu'on retirera à la fin. Un `docker image prune` généraliste supprimerait
# aussi les images sans tag des autres projets de la machine.
OLD_IMAGE="$(sudo docker images -q gd-frontend 2>/dev/null | head -1)"

# Construction AVANT de toucher au conteneur en service : un build qui échoue
# laisse l'ancienne version en ligne. L'ordre inverse (stop / rm / rmi puis
# build) laissait le service arrêté ET l'image supprimée en cas d'échec.
if ! sudo docker build -t gd-frontend .; then
  echo "updateFront : build échoué — le conteneur en service n'a pas été touché." >&2
  exit 1
fi

# Le conteneur tourne encore sur l'ancienne image, qui vient de perdre son tag
# au profit de la nouvelle : on l'arrête et on le retire maintenant seulement.
sudo docker stop gd-frontend 2>/dev/null
sudo docker rm gd-frontend 2>/dev/null

sudo docker run -d -p "${FRONTEND_PORT}:80" \
  -e BACKEND_URL="http://${BACKEND_HOST}:${BACKEND_PORT}" \
  -e APP_NAME="$APP_NAME" \
  --name gd-frontend \
  gd-frontend

# L'ancienne image a perdu son tag au profit de la nouvelle et n'a plus de
# conteneur : sans ce retrait, un exemplaire s'accumulerait à chaque
# déploiement. Après le `docker rm` ci-dessus, sinon elle compte comme utilisée.
# Le test d'égalité couvre le cas où le build n'a rien changé (cache) : l'image
# est alors la même, il ne faut surtout pas la supprimer.
NEW_IMAGE="$(sudo docker images -q gd-frontend 2>/dev/null | head -1)"
if [ -n "$OLD_IMAGE" ] && [ "$OLD_IMAGE" != "$NEW_IMAGE" ]; then
  sudo docker rmi "$OLD_IMAGE" 2>/dev/null
fi

cd ..
