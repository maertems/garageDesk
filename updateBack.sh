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
sudo docker stop gd-backend
sudo docker rm gd-backend
sudo docker rmi gd-api

sudo docker build -t gd-api .
sudo docker run -d -p "${BACKEND_PORT}:80" \
  -e MYSQL_HOST="$MYSQL_HOST" \
  -e MYSQL_USER="$MYSQL_USER" \
  -e MYSQL_PASSWORD="$MYSQL_PASSWORD" \
  -e MYSQL_DATABASE="$MYSQL_DATABASE" \
  -e APP_NAME="$APP_NAME" \
  --name gd-backend \
  gd-api



cd ..
