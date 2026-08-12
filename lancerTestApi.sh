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

cd "$SCRIPT_DIR/backEnd"
MYSQL_HOST="$MYSQL_HOST" MYSQL_USER="$MYSQL_USER" MYSQL_PASSWORD="$MYSQL_PASSWORD" MYSQL_DATABASE="$MYSQL_DATABASE" python3 -m pytest tests/ -v
