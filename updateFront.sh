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
sudo docker stop gd-frontend 2>/dev/null
sudo docker rm gd-frontend 2>/dev/null
sudo docker rmi gd-frontend 2>/dev/null

sudo docker build -t gd-frontend .
sudo docker run -d -p "${FRONTEND_PORT}:80" \
  -e BACKEND_URL="http://${BACKEND_HOST}:${BACKEND_PORT}" \
  -e APP_NAME="$APP_NAME" \
  --name gd-frontend \
  gd-frontend


sudo docker rmi `sudo docker images | grep none | awk '{print $3}' ` 2>/dev/null

cd ..
