#!/bin/bash
#
# Restauration d'une sauvegarde produite par backupDb.sh.
#
#     backup/restoreDb.sh                          liste les sauvegardes disponibles
#     backup/restoreDb.sh <fichier.sql.gz>         restaure, après confirmation
#     backup/restoreDb.sh <fichier.sql.gz> --yes   restaure sans confirmation (automatique)
#
# Usage automatique — alimenter une instance de secours avec la dernière
# sauvegarde reçue de la production :
#
#     backup/restoreDb.sh /srv/recu/intranet_2026-08-17_040001.sql.gz --yes
#
# Le script REFUSE alors une sauvegarde plus ancienne que la dernière qu'il a
# restaurée, pour que l'instance de secours ne remonte jamais dans le temps. Le
# repère est gardé dans backup/data/.derniere-restauration.
#
# C'est le script le plus dangereux du dépôt : il ÉCRASE la base désignée par
# deploy.env. Il est donc bâti pour rendre l'accident difficile :
#
#   * il montre la cible et l'état actuel de la base AVANT de toucher à quoi que
#     ce soit, et demande de saisir le nom de la base pour confirmer ;
#   * il vérifie la sauvegarde avant de commencer — une restauration interrompue
#     par un fichier tronqué laisserait la base à moitié écrasée ;
#   * il prend une sauvegarde de l'état actuel avant d'écraser, pour qu'un
#     retour arrière reste possible ;
#   * il partage le verrou de backupDb.sh, ce qui empêche une sauvegarde
#     automatique de photographier la base en cours de restauration.
#
# Identifiants lus dans backup/.env, à côté de ce script. Voir backup/.env.example.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/data"
# Les arguments sont analysés sans ordre imposé : en automatique, on écrit
# volontiers `--yes` avant le fichier.
DUMP=""
FORCE=""
ALLOW_SHRINK=0
for arg in "$@"; do
  case "$arg" in
    --yes) FORCE="--yes" ;;
    --allow-shrink) ALLOW_SHRINK=1 ;;
    -*) echo "restoreDb : option inconnue — $arg" >&2; exit 1 ;;
    *) DUMP="$arg" ;;
  esac
done

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

command -v mysql >/dev/null || { echo "restoreDb : client mysql introuvable." >&2; exit 1; }
command -v gzip >/dev/null || { echo "restoreDb : gzip introuvable." >&2; exit 1; }

# ── Sans argument : lister ce qui est disponible ───────────────────────────────
if [ -z "$DUMP" ]; then
  echo "Sauvegardes disponibles dans $BACKUP_DIR :"
  if ! ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -20 | while read -r f; do
        printf '  %-52s %8s  %s\n' "$(basename "$f")" \
          "$(du -h "$f" | cut -f1)" "$(date -r "$f" '+%d/%m/%Y %H:%M')"
      done | grep .; then
    echo "  (aucune)"
  fi
  # Les fichiers marqués incomplets par backupDb.sh sont signalés, pas proposés.
  if ls -1 "$BACKUP_DIR"/*.INCOMPLET >/dev/null 2>&1; then
    echo
    echo "Fichiers INCOMPLETS présents (non restaurables) :"
    ls -1 "$BACKUP_DIR"/*.INCOMPLET | while read -r f; do echo "  $(basename "$f")"; done
  fi
  echo
  echo "Usage : $0 <fichier.sql.gz> [--yes]"
  exit 0
fi

[ -f "$DUMP" ] || { echo "restoreDb : fichier introuvable — $DUMP" >&2; exit 1; }
case "$DUMP" in
  *.INCOMPLET)
    echo "restoreDb : ce fichier a été marqué INCOMPLET par backupDb.sh, il n'est pas restaurable." >&2
    exit 1
    ;;
esac

# ── Vérification de la sauvegarde, AVANT de toucher à la base ─────────────────
#
# Une restauration qui s'interrompt en cours de route laisse la base à moitié
# écrasée : il vaut mieux découvrir maintenant qu'un fichier est abîmé.
echo "Vérification de $DUMP…"

# Fichier encore en cours d'écriture ? En automatique, le cron peut se déclencher
# pendant que rsync ou scp dépose encore la sauvegarde. La taille est relevée deux
# fois : si elle bouge, le transfert n'est pas fini. Ce cas n'est pas toujours
# rattrapé par les contrôles suivants — une archive partielle peut être
# gzip-valide si la coupure tombe sur une frontière de bloc.
T1=$(stat -c %s "$DUMP" 2>/dev/null || echo 0)
sleep 2
T2=$(stat -c %s "$DUMP" 2>/dev/null || echo 0)
if [ "$T1" != "$T2" ]; then
  echo "restoreDb : le fichier grossit encore ($T1 → $T2 octets) — transfert en cours." >&2
  echo "  Reprendre quand la copie sera terminée." >&2
  exit 1
fi
if [ "$T2" -eq 0 ]; then
  echo "restoreDb : fichier vide." >&2
  exit 1
fi

# Intégrité de l'archive, puis marqueur de fin de mysqldump : les deux ensemble
# attestent que le dump est allé jusqu'au bout.
gzip -t "$DUMP" 2>/dev/null || { echo "restoreDb : archive gzip corrompue ou incomplète." >&2; exit 1; }
gzip -cd "$DUMP" | tail -5 | grep -q "Dump completed" \
  || { echo "restoreDb : marqueur de fin absent, sauvegarde tronquée." >&2; exit 1; }

# ── Garde-fou d'antériorité ───────────────────────────────────────────────────
#
# En automatique, une instance de secours est réalimentée à intervalles réguliers.
# Restaurer par erreur une sauvegarde plus ancienne que la précédente la ferait
# remonter dans le temps — on perdrait des données qu'elle avait déjà, sans que
# rien ne le signale.
#
# La comparaison porte sur l'horodatage CONTENU DANS LE NOM (backupDb.sh les
# nomme `base_AAAA-MM-JJ_HHMMSS.sql.gz`) et non sur la date de modification du
# fichier : un transfert par `scp` sans `-p` réécrit les mtimes, et l'ordre réel
# des sauvegardes serait perdu. On se rabat sur la mtime si le nom ne porte pas
# d'horodatage reconnaissable.
ETAT_FILE="$BACKUP_DIR/.derniere-restauration"

horodatage() {
  local nom
  nom="$(basename "$1")"
  if [[ "$nom" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{6}) ]]; then
    echo "${BASH_REMATCH[1]}${BASH_REMATCH[2]}${BASH_REMATCH[3]}${BASH_REMATCH[4]}"
  else
    date -r "$1" '+%Y%m%d%H%M%S'
  fi
}

DUMP_TS="$(horodatage "$DUMP")"
if [ -f "$ETAT_FILE" ]; then
  DERNIER_TS="$(cut -d' ' -f1 "$ETAT_FILE" 2>/dev/null)"
  DERNIER_TABLES="$(cut -d' ' -f2 "$ETAT_FILE" 2>/dev/null)"
  DERNIER_NOM="$(cut -d' ' -f3- "$ETAT_FILE" 2>/dev/null)"
  if [ -n "${DERNIER_TS:-}" ]; then
    if [ "$DUMP_TS" -lt "$DERNIER_TS" ] 2>/dev/null; then
      echo "restoreDb : REFUS — cette sauvegarde est plus ancienne que la dernière restaurée." >&2
      echo "  proposée : $(basename "$DUMP")  ($DUMP_TS)" >&2
      echo "  dernière : ${DERNIER_NOM:-?}  ($DERNIER_TS)" >&2
      echo "  Restaurer reviendrait à faire remonter la base dans le temps." >&2
      exit 1
    fi
    if [ "$DUMP_TS" = "$DERNIER_TS" ] 2>/dev/null; then
      # Même sauvegarde qu'au passage précédent : rien de neuf, ce n'est pas une
      # anomalie. Sortie en 0 pour ne pas alerter cron à chaque tour.
      echo "restoreDb : $(basename "$DUMP") a déjà été restaurée, rien à faire."
      exit 0
    fi
  fi
fi

DUMP_TABLES="$(gzip -cd "$DUMP" | grep -c '^CREATE TABLE')"
DUMP_DB="$(gzip -cd "$DUMP" | grep -m1 -oE 'CREATE DATABASE[^`]*`[^`]+`' | grep -oE '`[^`]+`$' | tr -d '`')"

# Une archive saine et terminée peut malgré tout être incomplète : un dump lancé
# avec des droits insuffisants, ou sur une base à moitié restaurée, se termine
# proprement avec moins de tables. On refuse donc qu'une restauration en apporte
# moins que la précédente.
if [ "$DUMP_TABLES" -eq 0 ]; then
  echo "restoreDb : aucune table dans cette sauvegarde — rien à restaurer." >&2
  exit 1
fi
if [ -n "${DERNIER_TABLES:-}" ] && [ "$DUMP_TABLES" -lt "$DERNIER_TABLES" ] 2>/dev/null; then
  if [ "$ALLOW_SHRINK" != "1" ]; then
    echo "restoreDb : REFUS — cette sauvegarde contient MOINS de tables que la dernière restaurée." >&2
    echo "  proposée : $DUMP_TABLES tables" >&2
    echo "  dernière : $DERNIER_TABLES tables (${DERNIER_NOM:-?})" >&2
    echo "  Signe d'une sauvegarde partielle. Si la diminution est voulue" >&2
    echo "  (tables réellement supprimées), relancer avec --allow-shrink." >&2
    exit 1
  fi
  echo "  note : $DUMP_TABLES tables contre $DERNIER_TABLES précédemment (--allow-shrink)"
fi

echo "  archive saine et terminée, $DUMP_TABLES tables, base d'origine : ${DUMP_DB:-inconnue}"

# Le mot de passe passe par un fichier d'options temporaire, jamais par la ligne
# de commande : un `-p...` est visible de tous dans `ps`.
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

# ── État actuel de la cible ───────────────────────────────────────────────────
ETAT="$(mysql --defaults-extra-file="$CNF" -N -B -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$MYSQL_DATABASE'" 2>/dev/null)"
if [ -z "$ETAT" ]; then
  echo "restoreDb : impossible d'interroger $MYSQL_DATABASE sur $MYSQL_HOST." >&2
  exit 1
fi

# Le filet sera-t-il possible ? La réponse doit figurer dans l'encadré, AVANT la
# confirmation : sans backupDb.sh, la restauration est irréversible, et l'apprendre
# après avoir confirmé ne sert à rien.
AVANT_DIR="$BACKUP_DIR/avant-restauration"
if [ "$ETAT" -eq 0 ]; then
  FILET="sans objet — la base cible est vide"
elif [ -x "$SCRIPT_DIR/backupDb.sh" ]; then
  FILET="oui, dans backup/data/avant-restauration/"
else
  FILET="NON (backupDb.sh absent) — OPÉRATION IRRÉVERSIBLE"
fi

cat <<INFO

  ┌─ RESTAURATION ─────────────────────────────────────────────
  │  Sauvegarde : $(basename "$DUMP")
  │               $(date -r "$DUMP" '+%d/%m/%Y %H:%M'), $DUMP_TABLES tables
  │
  │  CIBLE      : $MYSQL_DATABASE sur $MYSQL_HOST:$MYSQL_PORT
  │               contient actuellement $ETAT table(s)
  │
  │  Filet      : $FILET
  │
  │  Les tables présentes dans la sauvegarde seront ÉCRASÉES.
  └────────────────────────────────────────────────────────────
INFO

# ── Confirmation ──────────────────────────────────────────────────────────────
#
# Saisir le nom de la base plutôt qu'un « oui » : on ne peut pas confirmer par
# réflexe une base qu'on n'a pas lue.
if [ "$FORCE" != "--yes" ]; then
  printf 'Pour confirmer, saisir le nom de la base cible (%s) : ' "$MYSQL_DATABASE"
  read -r REPONSE
  if [ "$REPONSE" != "$MYSQL_DATABASE" ]; then
    echo "restoreDb : annulé (saisie « $REPONSE »)."
    exit 1
  fi
fi

# ── Filet : sauvegarde de l'état actuel avant d'écraser ───────────────────────
#
# C'est ce qui rend l'opération réversible. Sautée si la base est vide (rien à
# préserver) ou si backupDb.sh est absent.
#
# Elle est prise AVANT que ce script ne pose le verrou : backupDb.sh prend et
# relâche le sien lui-même, et il s'arrête — en sortant en 0, puisque c'est sa
# protection normale — si le verrou est déjà tenu. Le lui laisser aurait donc
# produit un « succès » sans fichier, et un filet de sécurité inexistant. Erreur
# effectivement commise puis trouvée en mesurant.
if [ "$ETAT" -gt 0 ] && [ -x "$SCRIPT_DIR/backupDb.sh" ]; then
  echo
  echo "Sauvegarde de l'état actuel avant écrasement…"
  NB_AVANT=$(ls -1 "$AVANT_DIR"/*.sql.gz 2>/dev/null | wc -l)
  "$SCRIPT_DIR/backupDb.sh" "$AVANT_DIR" || true
  NB_APRES=$(ls -1 "$AVANT_DIR"/*.sql.gz 2>/dev/null | wc -l)
  # On vérifie le FICHIER produit, pas le code de retour : backupDb.sh sort en 0
  # quand il renonce faute de verrou libre.
  if [ "$NB_APRES" -gt "$NB_AVANT" ]; then
    echo "  état précédent conservé dans $AVANT_DIR/"
  elif [ "$FORCE" = "--yes" ]; then
    echo "restoreDb : la sauvegarde préalable n'a rien produit — on continue (--yes)." >&2
  else
    echo "restoreDb : la sauvegarde préalable n'a produit aucun fichier." >&2
    echo "  Restauration ABANDONNÉE : sans elle, l'opération serait irréversible." >&2
    echo "  Relancer avec --yes pour l'accepter malgré tout." >&2
    exit 1
  fi
fi

# ── Verrou, partagé avec backupDb.sh ──────────────────────────────────────────
#
# Le même fichier de verrou que la sauvegarde : les deux opérations deviennent
# mutuellement exclusives. Sans cela, le cron de sauvegarde pourrait photographier
# la base au milieu de la restauration et archiver un état incohérent — une
# mauvaise sauvegarde qui aurait l'air d'une bonne.
#
# Posé ici, après la sauvegarde préalable, pour ne pas se bloquer soi-même.
LOCK="${TMPDIR:-/tmp}/backupDb-$(id -u).lock"
exec 9>"$LOCK" || { echo "restoreDb : verrou inaccessible ($LOCK)." >&2; exit 1; }
if command -v flock >/dev/null; then
  flock -n 9 || {
    echo "restoreDb : une sauvegarde est en cours, abandon avant d'écraser." >&2
    exit 1
  }
fi

# ── Restauration ──────────────────────────────────────────────────────────────
echo
echo "Restauration en cours…"
if ! gzip -cd "$DUMP" | mysql --defaults-extra-file="$CNF"; then
  echo "restoreDb : ÉCHEC pendant la restauration. La base est probablement dans un" >&2
  echo "  état intermédiaire. L'état précédent est dans $BACKUP_DIR/avant-restauration/" >&2
  exit 1
fi

# Repère enregistré seulement maintenant : après un échec, une reprise avec le
# même fichier doit rester possible.
echo "$DUMP_TS $DUMP_TABLES $(basename "$DUMP")" > "$ETAT_FILE"

APRES="$(mysql --defaults-extra-file="$CNF" -N -B -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$MYSQL_DATABASE'" 2>/dev/null)"
echo "restoreDb : terminé — $MYSQL_DATABASE contient $APRES table(s) (sauvegarde : $DUMP_TABLES)."

if [ "${APRES:-0}" -lt "$DUMP_TABLES" ]; then
  echo "restoreDb : ATTENTION, moins de tables que dans la sauvegarde. À vérifier." >&2
  exit 1
fi
if [ "${APRES:-0}" -gt "$DUMP_TABLES" ]; then
  echo "  Note : la base contient des tables absentes de la sauvegarde. mysqldump ne"
  echo "  supprime que les tables qu'il restaure, celles créées depuis subsistent."
fi
