#!/bin/bash
#
# Sauvegarde complète de la base MySQL. Une exécution = un fichier.
#
#     0 */3 * * * /chemin/vers/backup/backupDb.sh
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
# Chaque exécution laisse une trace horodatée dans backup/logs/backupDb-AAAA-MM.log
# (un fichier par mois, jamais effacé) : le fichier produit, sa taille, son nombre de
# tables, ou la raison de l'échec, et le code de sortie. La ligne de cron n'a donc
# plus besoin de rediriger la sortie.
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

# ── Journal ───────────────────────────────────────────────────────────────────
#
# Installé AVANT le verrou : un démarrage refusé parce qu'une sauvegarde est déjà
# en cours doit laisser une trace, c'est même ce qu'on voudra relire le jour où les
# passages s'empileront.
#
# Fichier distinct de celui de restoreDb.sh, et rattaché au répertoire du script et
# non à $DEST : restoreDb.sh appelle ce script pour son filet de sécurité, avec une
# destination différente. Un journal commun mêlerait les deux rôles — lecteur de la
# production d'un côté, écrivain de la base de secours de l'autre — et un journal
# par destination éparpillerait les traces.
#
# Un fichier par mois, jamais effacé : ce script n'efface rien, son journal non plus.
LOG_DIR="$SCRIPT_DIR/logs"
LOG=""
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  LOG="$LOG_DIR/backupDb-$(date '+%Y-%m').log"
  # Journal impossible à écrire (droits, disque plein) : on continue sans. La
  # sauvegarde importe plus que sa trace. Signalé une fois, pas à chaque ligne.
  if ! touch "$LOG" 2>/dev/null; then
    echo "backupDb : journal inaccessible ($LOG), exécution sans trace." >&2
    LOG=""
  fi
else
  echo "backupDb : impossible de créer $LOG_DIR, exécution sans trace." >&2
fi

# Le PID figure dans chaque ligne : plusieurs exécutions peuvent se présenter en
# même temps — c'est précisément ce que le verrou refuse — et leurs lignes se
# mêleraient sans lui.
journal() {
  [ -n "$LOG" ] || return 0
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$*" >> "$LOG"
}

# Affiche ET journalise, `alerter` préfixant ERREUR pour que le journal distingue le
# compte rendu de l'anomalie.
dire()    { echo "$*"; journal "$*"; }
avertir() { echo "$*" >&2; journal "AVIS $*"; }
alerter() { echo "$*" >&2; journal "ERREUR $*"; }

# Le code de sortie est journalisé quoi qu'il arrive, y compris sur une sortie non
# prévue : sans cela le journal d'une exécution avortée s'arrêterait sans dire
# qu'elle s'est arrêtée, ce qui se lit comme une sauvegarde encore en cours.
#
# Le fichier d'options est supprimé ICI plutôt que par un second trap EXIT : un
# shell n'en a qu'un, et un `trap 'rm -f "$CNF"; _fin' EXIT` aurait fait lire à _fin
# le code de retour du `rm` — toujours 0 — au lieu de celui du script.
_fin() {
  local code=$?
  [ -n "${CNF:-}" ] && rm -f "$CNF"
  journal "fin, code $code"
  return $code
}
trap _fin EXIT

journal "--- lancement : destination $DEST"

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
exec 9>"$LOCK" || { alerter "backupDb : verrou inaccessible ($LOCK)."; exit 1; }
if command -v flock >/dev/null; then
  if ! flock -n 9; then
    avertir "backupDb : une sauvegarde est déjà en cours, exécution abandonnée."
    exit 0
  fi
else
  avertir "backupDb : flock absent, exécution sans verrou."
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

# Identifiants : un préfixe par usage, avec repli sur les variables communes.
#
# Sur une machine de sauvegarde, les deux scripts ne parlent PAS à la même base :
# backupDb interroge la production (distante), restoreDb écrit dans la base locale
# de secours. Confondre les deux ferait écraser la production par un dump — d'où
# des variables distinctes plutôt qu'un seul jeu.
#
# Ordre de résolution : BACKUP_MYSQL_X, puis MYSQL_X, puis erreur. Un .env qui ne
# déclare que les MYSQL_* communes continue donc de fonctionner.
MYSQL_HOST="${BACKUP_MYSQL_HOST:-${MYSQL_HOST:-}}"
MYSQL_PORT="${BACKUP_MYSQL_PORT:-${MYSQL_PORT:-3306}}"
MYSQL_USER="${BACKUP_MYSQL_USER:-${MYSQL_USER:-}}"
MYSQL_PASSWORD="${BACKUP_MYSQL_PASSWORD:-${MYSQL_PASSWORD:-}}"
MYSQL_DATABASE="${BACKUP_MYSQL_DATABASE:-${MYSQL_DATABASE:-}}"

# Contrôles explicites, et non `: "${VAR:?message}"` : le message d'un `:?` est
# écrit par bash lui-même et échappe donc au journal. Une configuration incomplète
# n'y laisserait qu'un « fin, code 1 » sans sa cause.
MANQUANTES=""
for v in HOST USER PASSWORD DATABASE; do
  eval "valeur=\${MYSQL_$v:-}"
  [ -n "$valeur" ] || MANQUANTES="$MANQUANTES MYSQL_$v"
done
if [ -n "$MANQUANTES" ]; then
  alerter "backupDb : configuration incomplète, manque —$MANQUANTES"
  for v in $MANQUANTES; do
    echo "  renseigner BACKUP_$v (ou $v) dans backup/.env" >&2
  done
  exit 1
fi

command -v mysqldump >/dev/null || { alerter "backupDb : mysqldump introuvable."; exit 1; }
command -v gzip >/dev/null || { alerter "backupDb : gzip introuvable."; exit 1; }

mkdir -p "$DEST" || { alerter "backupDb : destination inaccessible — $DEST"; exit 1; }

# Le mot de passe passe par un fichier d'options temporaire, jamais par la ligne
# de commande : un `-p...` est visible de tous dans `ps`.
#
# Ce fichier-là EST supprimé en sortie, et c'est la seule suppression du script :
# il contient le mot de passe en clair, le laisser traîner serait une faille. Ce
# n'est pas une sauvegarde, c'est le fichier de travail du script.
CNF="$(mktemp)" || exit 1
chmod 600 "$CNF"
# Sa suppression est assurée par _fin (trap EXIT posé en tête de script).
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
  alerter "backupDb : le dump a échoué (code $STATUS), fichier marqué $OUT.INCOMPLET"
  exit 1
fi
if ! gzip -cd "$OUT" | tail -5 | grep -q "Dump completed"; then
  mv "$OUT" "$OUT.INCOMPLET" 2>/dev/null
  alerter "backupDb : dump tronqué (marqueur de fin absent), fichier marqué $OUT.INCOMPLET"
  exit 1
fi

TABLES="$(gzip -cd "$OUT" | grep -c '^CREATE TABLE')"
SIZE="$(du -h "$OUT" | cut -f1)"
TOTAL="$(du -sh "$DEST" 2>/dev/null | cut -f1)"
dire "backupDb : $OUT ($SIZE, $TABLES tables) — total du répertoire : $TOTAL"

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
