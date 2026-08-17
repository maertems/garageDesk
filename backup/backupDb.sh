#!/bin/bash
#
# Sauvegarde complète de la base MySQL. Une exécution = un fichier.
#
#     0 */3 * * * /chemin/vers/backup/backupDb.sh >> /var/log/backupDb.log 2>&1
#
# Ce script ne fait QUE la sauvegarde :
#   * une seule exécution à la fois : un verrou en tête refuse le démarrage si une
#     sauvegarde est déjà en cours ;
#   * la fréquence est décidée par cron, pas ici ;
#   * AUCUN fichier de sauvegarde n'est supprimé — ni rotation, ni rétention, ni
#     purge. La place occupée croît donc indéfiniment, c'est volontaire et c'est
#     à surveiller : environ 5 Mo par passage, soit ~40 Mo par jour à raison de
#     8 passages. Le ménage se fait à part (voir la note en fin de fichier).
#
# Uniquement des sauvegardes complètes, pas de variante allégée : la base pèse
# 21 Mo, et la restauration reste ainsi une seule commande.
#
# Usage :  backup/backupDb.sh [répertoire_de_destination]
# Défaut : backup/data
#
# Identifiants lus dans backup/.env, à côté de ce script — rien n'est écrit en dur
# ici, le dépôt étant public. Voir backup/.env.example.
#
# Sort en erreur (code non nul) dès qu'une étape échoue : cron enverra alors la
# sortie par courriel. Une sauvegarde qui échoue en silence est pire qu'absente,
# puisqu'on croit en avoir une.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$SCRIPT_DIR/data}"

# ── Verrou : une seule sauvegarde à la fois ───────────────────────────────────
#
# Sans lui, deux exécutions simultanées interrogeraient la base en parallèle pour
# rien, et surtout les passages s'empileraient le jour où un dump durerait plus
# longtemps que l'intervalle du cron — base grossie, disque lent, réseau saturé.
#
# `flock` plutôt qu'un fichier de PID : il n'y a pas de course entre le test et la
# prise du verrou, et le noyau le libère de lui-même si le processus meurt. Un
# fichier de PID, lui, resterait après un arrêt brutal et bloquerait toutes les
# sauvegardes suivantes.
#
# Sortie en 0 et non en erreur : refuser de démarrer parce qu'une sauvegarde est
# déjà en cours n'est pas une défaillance, c'est la protection qui fonctionne. Le
# message part malgré tout sur la sortie d'erreur, donc il apparaît dans le
# journal du cron.
LOCK="${TMPDIR:-/tmp}/backupDb-$(id -u).lock"
exec 9>"$LOCK" || { echo "backupDb : verrou inaccessible ($LOCK)." >&2; exit 1; }
if command -v flock >/dev/null; then
  if ! flock -n 9; then
    echo "backupDb : une sauvegarde est déjà en cours, exécution abandonnée." >&2
    exit 0
  fi
else
  echo "backupDb : flock absent, exécution sans verrou." >&2
fi

# Identifiants lus dans le .env placé À CÔTÉ DE CE SCRIPT, et non dans le
# deploy.env de la racine : les scripts de sauvegarde deviennent autonomes, et
# peuvent tourner sur une machine qui n'héberge pas l'application et n'a donc
# aucune raison de détenir toute sa configuration de déploiement.
#
# Le fichier n'est pas obligatoire : des variables déjà présentes dans
# l'environnement font l'affaire, ce qui laisse la porte ouverte à un cron qui
# les fournirait lui-même. Ce sont les contrôles ci-dessous qui tranchent.
#
# `.env` est ignoré par git quel que soit le répertoire (motif sans chemin dans
# .gitignore) : il ne partira jamais dans le dépôt public. Voir .env.example.
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

: "${MYSQL_HOST:?MYSQL_HOST manquant — renseigner backup/.env (voir backup/.env.example)}"
: "${MYSQL_USER:?MYSQL_USER manquant — renseigner backup/.env (voir backup/.env.example)}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD manquant — renseigner backup/.env (voir backup/.env.example)}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE manquant — renseigner backup/.env (voir backup/.env.example)}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

command -v mysqldump >/dev/null || { echo "backupDb : mysqldump introuvable." >&2; exit 1; }
command -v gzip >/dev/null || { echo "backupDb : gzip introuvable." >&2; exit 1; }

mkdir -p "$DEST" || exit 1

# Le mot de passe passe par un fichier d'options temporaire, jamais par la ligne
# de commande : un `-p...` est visible de tous dans `ps`.
#
# Ce fichier-là EST supprimé en sortie, et c'est la seule suppression du script :
# il contient le mot de passe en clair, le laisser traîner serait une faille. Ce
# n'est pas une sauvegarde, c'est le fichier de travail du script.
CNF="$(mktemp)" || exit 1
chmod 600 "$CNF"
trap 'rm -f "$CNF"' EXIT
cat > "$CNF" <<EOF
[client]
host=$MYSQL_HOST
port=$MYSQL_PORT
user=$MYSQL_USER
password=$MYSQL_PASSWORD
EOF

# Secondes incluses : deux lancements dans la même minute — un cron suivi d'un
# appel manuel — produiraient sinon le même nom de fichier, et le second
# écraserait le premier sans un mot.
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$DEST/${MYSQL_DATABASE}_${STAMP}.sql.gz"

# Jamais d'écrasement. Le verrou empêche deux exécutions SIMULTANÉES, pas deux
# exécutions SUCCESSIVES dans la même seconde — un dump de 21 Mo prend environ une
# seconde, deux appels manuels enchaînés suffisent. Écraser une sauvegarde
# existante serait l'effacer, ce que ce script ne doit pas faire. Le cas a été
# observé en mesurant : un dump en échec avait remplacé une bonne sauvegarde avant
# de se marquer lui-même comme incomplet.
if [ -e "$OUT" ]; then
  n=2
  while [ -e "$DEST/${MYSQL_DATABASE}_${STAMP}_$n.sql.gz" ]; do n=$((n + 1)); done
  OUT="$DEST/${MYSQL_DATABASE}_${STAMP}_$n.sql.gz"
fi

# --single-transaction : instantané cohérent sans verrouiller les écritures. Les
#   tables sont toutes en InnoDB, c'est donc la bonne option ; elle serait
#   inopérante sur du MyISAM.
# --quick : lit ligne à ligne au lieu de charger chaque table en mémoire.
# --hex-blob : indispensable depuis que companySettings.logo est un MEDIUMBLOB —
#   sans lui, les octets du logo passent par des chaînes échappées et peuvent
#   revenir abîmés à la restauration.
# --routines --triggers --events : rien de tel aujourd'hui, mais gratuit et le
#   jour où il y en aura, la sauvegarde les prendra sans qu'on y repense.
# --databases : ajoute le CREATE DATABASE et le USE, ce qui rend le fichier
#   restaurable sur un serveur vierge sans préparation. Prend aussi toutes les
#   tables existantes — utile, `schema.sql` ayant dérivé des migrations.
# --no-tablespaces : sans elle, mysqldump interroge les tablespaces et échoue sur
#   « you need (at least one of) the PROCESS privilege(s) », observé au premier
#   essai réel. L'alternative — accorder PROCESS — est à écarter : c'est un
#   privilège GLOBAL (ON *.*) qui laisse voir toutes les requêtes en cours du
#   serveur, y compris celles des autres bases. Disproportionné pour un compte de
#   sauvegarde, alors que l'information de tablespace ne sert à rien ici : les
#   tables sont dans le tablespace InnoDB par défaut.
mysqldump --defaults-extra-file="$CNF" \
      --single-transaction \
      --quick \
      --hex-blob \
      --no-tablespaces \
      --default-character-set=utf8mb4 \
      --routines --triggers --events \
      --databases "$MYSQL_DATABASE" \
    | gzip -9 > "$OUT"
STATUS=$?

# Un dump interrompu ou tronqué n'est PAS supprimé — le script n'efface rien —
# mais il est renommé en « .INCOMPLET » : le laisser sous son nom normal, ce
# serait risquer de le prendre un jour pour une sauvegarde valable. mysqldump
# termine son fichier par « -- Dump completed » ; l'absence de ce marqueur
# signale une troncature (disque plein, connexion coupée, mémoire épuisée).
if [ "$STATUS" -ne 0 ]; then
  mv "$OUT" "$OUT.INCOMPLET" 2>/dev/null
  echo "backupDb : le dump a échoué, fichier marqué $OUT.INCOMPLET" >&2
  exit 1
fi
if ! gzip -cd "$OUT" | tail -5 | grep -q "Dump completed"; then
  mv "$OUT" "$OUT.INCOMPLET" 2>/dev/null
  echo "backupDb : dump tronqué (marqueur de fin absent), fichier marqué $OUT.INCOMPLET" >&2
  exit 1
fi

TABLES="$(gzip -cd "$OUT" | grep -c '^CREATE TABLE')"
SIZE="$(du -h "$OUT" | cut -f1)"
TOTAL="$(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo "backupDb : $OUT ($SIZE, $TABLES tables) — total du répertoire : $TOTAL"

# ── Ce que ce script ne fait pas, volontairement ──────────────────────────────
#
# Le ménage. Aucun fichier n'est effacé ici, la place croît donc sans limite. À
# traiter séparément, au choix :
#
#   * une tâche cron dédiée, pour ne garder que les 30 derniers jours :
#       find /chemin/vers/backup/data -name '*.sql.gz' -mtime +30 -delete
#
#   * ou logrotate, si l'on préfère une configuration déclarative.
#
# La copie hors site non plus. Une sauvegarde posée sur le même disque que la
# base ne protège que d'une erreur humaine, pas d'une panne de disque ni d'une
# machine perdue :
#       rsync -az "$DEST/" sauvegarde@autre-machine:/srv/backups/intranet/
#       rclone copy "$DEST" distant:intranet-backups
