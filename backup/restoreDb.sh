#!/bin/bash
#
# Restauration d'une sauvegarde produite par backupDb.sh.
#
#     backup/restoreDb.sh --list                   liste les sauvegardes disponibles
#     backup/restoreDb.sh                          restaure la PLUS RÉCENTE
#     backup/restoreDb.sh <fichier.sql.gz>         restaure, après confirmation
#     backup/restoreDb.sh <fichier.sql.gz> --yes   restaure sans confirmation (automatique)
#
# Usage automatique — alimenter une instance de secours avec la dernière
# sauvegarde reçue de la production. Sans fichier, le script prend la plus récente
# de backup/data, ce qui donne une ligne de cron qui n'a rien à savoir des noms :
#
#     0 * * * * /chemin/backup/restoreDb.sh --yes >> /var/log/restoreDb.log 2>&1
#
# « La plus récente » se juge sur l'horodatage porté par le NOM, pas sur la date de
# modification : un transfert par scp sans -p réécrit les mtimes et l'ordre réel
# serait perdu. C'est la mesure qu'emploie aussi le garde-fou ci-dessous, sans quoi
# le script pourrait élire un fichier que sa propre protection refuserait ensuite.
#
# Relancé alors que rien de neuf n'est arrivé, il sort en 0 sans toucher à la base :
# le cron peut donc tourner plus souvent que les sauvegardes n'arrivent.
#
# Le script REFUSE alors une sauvegarde plus ancienne que la dernière qu'il a
# restaurée, pour que l'instance de secours ne remonte jamais dans le temps. Le
# repère est gardé dans backup/data/.derniere-restauration.
#
# C'est le script le plus dangereux du dépôt : il ÉCRASE la base désignée par
# backup/.env. Il est donc bâti pour rendre l'accident difficile :
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
# Chaque exécution laisse une trace horodatée dans backup/logs/restoreDb-AAAA-MM.log
# (un fichier par mois, jamais effacé) : ce qui a été retenu, sur quelle base, ce
# qui a été refusé et pourquoi, et le code de sortie.
#
# Identifiants lus dans backup/.env, à côté de ce script. Voir backup/.env.example.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/data"

# ── Journal ───────────────────────────────────────────────────────────────────
#
# Un fichier par mois, jamais effacé (règle du projet : ces scripts ne suppriment
# rien). Une exécution qui ne fait rien tient en deux lignes, le volume reste donc
# négligeable même avec un cron horaire.
#
# Le journal est alimenté par `journal()`, en parallèle de l'affichage, et NON en
# faisant passer la sortie du script dans un `tee` : stdout deviendrait un tuyau,
# et l'invite « saisir le nom de la base » — le garde-fou principal — s'afficherait
# avec du retard, voire après la lecture. On ne dégrade pas une protection pour
# obtenir un journal.
LOG_DIR="$SCRIPT_DIR/logs"
LOG=""
if mkdir -p "$LOG_DIR" 2>/dev/null; then
  LOG="$LOG_DIR/restoreDb-$(date '+%Y-%m').log"
  # Journal illisible (droits, disque plein) : on continue sans, la restauration
  # importe plus que sa trace. Signalé une fois, pas à chaque ligne.
  if ! touch "$LOG" 2>/dev/null; then
    echo "restoreDb : journal inaccessible ($LOG), exécution sans trace." >&2
    LOG=""
  fi
else
  echo "restoreDb : impossible de créer $LOG_DIR, exécution sans trace." >&2
fi

# Le PID figure dans chaque ligne : le verrou n'est posé que tard dans le script,
# deux exécutions peuvent donc se trouver ensemble dans la phase de vérification et
# entrelacer leurs lignes.
journal() {
  [ -n "$LOG" ] || return 0
  printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$*" >> "$LOG"
}

# Affiche ET journalise. Deux variantes, pour que le journal distingue ce qui a été
# dit à l'opérateur de ce qui a été signalé comme une anomalie.
dire()    { echo "$*"; journal "$*"; }
alerter() { echo "$*" >&2; journal "ERREUR $*"; }

# Le code de sortie est journalisé quoi qu'il arrive — y compris sur une sortie que
# le script n'a pas prévue, une interruption au clavier par exemple. Sans cela, le
# journal d'une exécution avortée s'arrêterait sans dire qu'elle s'est arrêtée, ce
# qui se lit comme un script encore en cours.
#
# Le nettoyage du fichier d'options est fait ICI, et non par un second trap EXIT :
# un shell n'en a qu'un, et un `trap 'rm -f "$CNF"; _fin' EXIT` aurait fait lire à
# _fin le code de retour du `rm` — toujours 0 — au lieu de celui du script.
_fin() {
  local code=$?
  [ -n "${CNF:-}" ] && rm -f "$CNF"
  journal "fin, code $code"
  return $code
}
trap _fin EXIT

journal "--- lancement : ${*:-(sans argument)}"
# Les arguments sont analysés sans ordre imposé : en automatique, on écrit
# volontiers `--yes` avant le fichier.
DUMP=""
FORCE=""
ALLOW_SHRINK=0
LISTER=0
for arg in "$@"; do
  case "$arg" in
    --yes) FORCE="--yes" ;;
    --allow-shrink) ALLOW_SHRINK=1 ;;
    --list) LISTER=1 ;;
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

# Identifiants : un préfixe par usage, avec repli sur les variables communes.
#
# Sur une machine de sauvegarde, les deux scripts ne parlent PAS à la même base :
# backupDb interroge la production (distante), restoreDb écrit dans la base locale
# de secours. Confondre les deux ferait écraser la production par un dump — d'où
# des variables distinctes plutôt qu'un seul jeu.
#
# Ordre de résolution : RESTORE_MYSQL_X, puis MYSQL_X, puis erreur. Un .env qui ne
# déclare que les MYSQL_* communes continue donc de fonctionner.
MYSQL_HOST="${RESTORE_MYSQL_HOST:-${MYSQL_HOST:-}}"
MYSQL_PORT="${RESTORE_MYSQL_PORT:-${MYSQL_PORT:-3306}}"
MYSQL_USER="${RESTORE_MYSQL_USER:-${MYSQL_USER:-}}"
MYSQL_PASSWORD="${RESTORE_MYSQL_PASSWORD:-${MYSQL_PASSWORD:-}}"
MYSQL_DATABASE="${RESTORE_MYSQL_DATABASE:-${MYSQL_DATABASE:-}}"

MANQUANTES=""
for v in HOST USER PASSWORD DATABASE; do
  eval "valeur=\${MYSQL_$v:-}"
  [ -n "$valeur" ] || MANQUANTES="$MANQUANTES MYSQL_$v"
done
if [ -n "$MANQUANTES" ]; then
  alerter "restoreDb : configuration incomplète, manque —$MANQUANTES"
  for v in $MANQUANTES; do
    echo "  renseigner RESTORE_$v (ou $v) dans backup/.env" >&2
  done
  exit 1
fi

command -v mysql >/dev/null || { echo "restoreDb : client mysql introuvable." >&2; exit 1; }
command -v gzip >/dev/null || { echo "restoreDb : gzip introuvable." >&2; exit 1; }

# Horodatage d'une sauvegarde, tiré de son NOM (`base_AAAA-MM-JJ_HHMMSS.sql.gz`) et
# non de sa date de modification : un transfert par `scp` sans `-p` réécrit les
# mtimes. Sert à la fois à choisir la plus récente et à refuser une antérieure —
# les deux doivent s'appuyer sur la même mesure, sinon le script pourrait
# sélectionner un fichier que son propre garde-fou refuse ensuite.
horodatage() {
  local nom
  nom="$(basename "$1")"
  if [[ "$nom" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2})_([0-9]{6}) ]]; then
    echo "${BASH_REMATCH[1]}${BASH_REMATCH[2]}${BASH_REMATCH[3]}${BASH_REMATCH[4]}"
  else
    date -r "$1" '+%Y%m%d%H%M%S'
  fi
}

# La plus récente des sauvegardes de $BACKUP_DIR, ou rien. Le motif n'est pas
# récursif : le sous-répertoire avant-restauration/ est donc exclu d'office, et
# c'est heureux — choisir un filet de restauration précédent n'aurait aucun sens.
# Les fichiers .INCOMPLET ne correspondent pas au motif *.sql.gz non plus.
plus_recente() {
  local f meilleure="" ts meilleur_ts=""
  for f in "$BACKUP_DIR"/*.sql.gz; do
    [ -f "$f" ] || continue
    ts="$(horodatage "$f")"
    # Horodatage non numérique — nom inattendu et `date -r` en échec : on écarte le
    # fichier au lieu de le comparer. Le retenir serait pire que l'ignorer : `[ -gt ]`
    # sort en erreur sur un opérande non numérique, donc toutes les comparaisons
    # suivantes seraient fausses et ce fichier resterait élu jusqu'au bout.
    case "$ts" in
      ''|*[!0-9]*) continue ;;
    esac
    if [ -z "$meilleur_ts" ] || [ "$ts" -gt "$meilleur_ts" ]; then
      meilleur_ts="$ts"; meilleure="$f"
    fi
  done
  echo "$meilleure"
}

# ── --list : montrer ce qui est disponible, sans rien restaurer ────────────────
#
# Trié par l'horodatage du NOM, comme plus_recente, et l'élue est désignée : un
# listage classé par date de modification afficherait un autre ordre que celui qui
# décide, et donnerait à croire qu'un lancement sans argument prendrait la première
# de la liste.
if [ "$LISTER" = "1" ]; then
  echo "Sauvegardes disponibles dans $BACKUP_DIR :"
  ELUE="$(plus_recente)"
  NB=0
  for f in "$BACKUP_DIR"/*.sql.gz; do [ -f "$f" ] && NB=$((NB + 1)); done
  if [ "$NB" -eq 0 ]; then
    echo "  (aucune)"
  else
    for f in "$BACKUP_DIR"/*.sql.gz; do
      [ -f "$f" ] || continue
      printf '%s\t%s\n' "$(horodatage "$f")" "$f"
    done | sort -rn | head -20 | while IFS="$(printf '\t')" read -r ts f; do
      marque=""
      [ "$f" = "$ELUE" ] && marque="  <- retenue sans argument"
      printf '  %-52s %8s  %s%s\n' "$(basename "$f")" \
        "$(du -h "$f" | cut -f1)" "$(date -r "$f" '+%d/%m/%Y %H:%M')" "$marque"
    done
  fi
  # Les fichiers marqués incomplets par backupDb.sh sont signalés, pas proposés.
  if ls -1 "$BACKUP_DIR"/*.INCOMPLET >/dev/null 2>&1; then
    echo
    echo "Fichiers INCOMPLETS présents (non restaurables) :"
    ls -1 "$BACKUP_DIR"/*.INCOMPLET | while read -r f; do echo "  $(basename "$f")"; done
  fi
  echo
  echo "Usage : $0 [fichier.sql.gz] [--yes] [--allow-shrink]"
  echo "        sans fichier, la plus récente est retenue"
  exit 0
fi

# ── Sans argument : prendre la sauvegarde la plus récente ──────────────────────
#
# C'est ce que veut l'usage automatique : le cron appelle `restoreDb.sh --yes` et
# le script se débrouille. Le garde-fou d'antériorité fait le reste — si la plus
# récente a déjà été restaurée, il sortira en 0 sans rien faire.
if [ -z "$DUMP" ]; then
  DUMP="$(plus_recente)"
  if [ -z "$DUMP" ]; then
    alerter "restoreDb : aucune sauvegarde exploitable dans $BACKUP_DIR."
    # Des .INCOMPLET et rien d'autre, c'est le symptôme d'un transfert coupé ou
    # d'une sauvegarde interrompue, pas d'un répertoire vide. Le dire évite de
    # chercher longtemps pourquoi « il n'y a rien » alors que des fichiers sont là.
    if ls -1 "$BACKUP_DIR"/*.INCOMPLET >/dev/null 2>&1; then
      echo "  Des fichiers .INCOMPLET sont présents : sauvegarde ou transfert" >&2
      echo "  interrompu. Ils ne sont pas restaurables — voir --list." >&2
    else
      echo "  Lancer backup/backupDb.sh, ou passer un fichier en argument." >&2
    fi
    exit 1
  fi
  dire "restoreDb : plus récente sauvegarde retenue — $(basename "$DUMP")"
fi


[ -f "$DUMP" ] || { alerter "restoreDb : fichier introuvable — $DUMP"; exit 1; }
case "$DUMP" in
  *.INCOMPLET)
    alerter "restoreDb : $(basename "$DUMP") marqué INCOMPLET par backupDb.sh, non restaurable."
    exit 1
    ;;
esac

# ── Vérification de la sauvegarde, AVANT de toucher à la base ─────────────────
#
# Une restauration qui s'interrompt en cours de route laisse la base à moitié
# écrasée : il vaut mieux découvrir maintenant qu'un fichier est abîmé.
dire "Vérification de $DUMP…"

# Fichier encore en cours d'écriture ? En automatique, le cron peut se déclencher
# pendant que rsync ou scp dépose encore la sauvegarde. La taille est relevée deux
# fois : si elle bouge, le transfert n'est pas fini. Ce cas n'est pas toujours
# rattrapé par les contrôles suivants — une archive partielle peut être
# gzip-valide si la coupure tombe sur une frontière de bloc.
T1=$(stat -c %s "$DUMP" 2>/dev/null || echo 0)
sleep 2
T2=$(stat -c %s "$DUMP" 2>/dev/null || echo 0)
if [ "$T1" != "$T2" ]; then
  alerter "restoreDb : le fichier grossit encore ($T1 → $T2 octets) — transfert en cours."
  echo "  Reprendre quand la copie sera terminée." >&2
  exit 1
fi
if [ "$T2" -eq 0 ]; then
  alerter "restoreDb : fichier vide."
  exit 1
fi

# Intégrité de l'archive, puis marqueur de fin de mysqldump : les deux ensemble
# attestent que le dump est allé jusqu'au bout.
gzip -t "$DUMP" 2>/dev/null || { alerter "restoreDb : archive gzip corrompue ou incomplète."; exit 1; }
gzip -cd "$DUMP" | tail -5 | grep -q "Dump completed" \
  || { alerter "restoreDb : marqueur de fin absent, sauvegarde tronquée."; exit 1; }

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

DUMP_TS="$(horodatage "$DUMP")"
if [ -f "$ETAT_FILE" ]; then
  DERNIER_TS="$(cut -d' ' -f1 "$ETAT_FILE" 2>/dev/null)"
  DERNIER_TABLES="$(cut -d' ' -f2 "$ETAT_FILE" 2>/dev/null)"
  DERNIER_NOM="$(cut -d' ' -f3- "$ETAT_FILE" 2>/dev/null)"
  if [ -n "${DERNIER_TS:-}" ]; then
    if [ "$DUMP_TS" -lt "$DERNIER_TS" ] 2>/dev/null; then
      alerter "restoreDb : REFUS — $(basename "$DUMP") ($DUMP_TS) est plus ancienne que la dernière restaurée, ${DERNIER_NOM:-?} ($DERNIER_TS)."
      echo "  proposée : $(basename "$DUMP")  ($DUMP_TS)" >&2
      echo "  dernière : ${DERNIER_NOM:-?}  ($DERNIER_TS)" >&2
      echo "  Restaurer reviendrait à faire remonter la base dans le temps." >&2
      exit 1
    fi
    if [ "$DUMP_TS" = "$DERNIER_TS" ] 2>/dev/null; then
      # Même sauvegarde qu'au passage précédent : rien de neuf, ce n'est pas une
      # anomalie. Sortie en 0 pour ne pas alerter cron à chaque tour.
      dire "restoreDb : $(basename "$DUMP") a déjà été restaurée, rien à faire."
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
  alerter "restoreDb : aucune table dans cette sauvegarde — rien à restaurer."
  exit 1
fi
if [ -n "${DERNIER_TABLES:-}" ] && [ "$DUMP_TABLES" -lt "$DERNIER_TABLES" ] 2>/dev/null; then
  if [ "$ALLOW_SHRINK" != "1" ]; then
    alerter "restoreDb : REFUS — $DUMP_TABLES tables contre $DERNIER_TABLES à la dernière restauration (${DERNIER_NOM:-?})."
    echo "  proposée : $DUMP_TABLES tables" >&2
    echo "  dernière : $DERNIER_TABLES tables (${DERNIER_NOM:-?})" >&2
    echo "  Signe d'une sauvegarde partielle. Si la diminution est voulue" >&2
    echo "  (tables réellement supprimées), relancer avec --allow-shrink." >&2
    exit 1
  fi
  dire "  note : $DUMP_TABLES tables contre $DERNIER_TABLES précédemment (--allow-shrink)"
fi

dire "  archive saine et terminée, $DUMP_TABLES tables, base d'origine : ${DUMP_DB:-inconnue}"

# Le mot de passe passe par un fichier d'options temporaire, jamais par la ligne
# de commande : un `-p...` est visible de tous dans `ps`.
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

# ── État actuel de la cible ───────────────────────────────────────────────────
ETAT="$(mysql --defaults-extra-file="$CNF" -N -B -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$MYSQL_DATABASE'" 2>/dev/null)"
if [ -z "$ETAT" ]; then
  alerter "restoreDb : impossible d'interroger $MYSQL_DATABASE sur $MYSQL_HOST."
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

journal "cible : $MYSQL_DATABASE sur $MYSQL_HOST:$MYSQL_PORT, $ETAT table(s) actuellement — filet : $FILET"

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
    dire "restoreDb : annulé (saisie « $REPONSE »)."
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
  dire "Sauvegarde de l'état actuel avant écrasement…"
  NB_AVANT=$(ls -1 "$AVANT_DIR"/*.sql.gz 2>/dev/null | wc -l)
  "$SCRIPT_DIR/backupDb.sh" "$AVANT_DIR" || true
  NB_APRES=$(ls -1 "$AVANT_DIR"/*.sql.gz 2>/dev/null | wc -l)
  # On vérifie le FICHIER produit, pas le code de retour : backupDb.sh sort en 0
  # quand il renonce faute de verrou libre.
  if [ "$NB_APRES" -gt "$NB_AVANT" ]; then
    dire "  état précédent conservé dans $AVANT_DIR/"
  elif [ "$FORCE" = "--yes" ]; then
    alerter "restoreDb : la sauvegarde préalable n'a rien produit — on continue (--yes)."
  else
    alerter "restoreDb : la sauvegarde préalable n'a produit aucun fichier, restauration abandonnée."
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
    alerter "restoreDb : une sauvegarde est en cours, abandon avant d'écraser."
    exit 1
  }
fi

# ── Restauration ──────────────────────────────────────────────────────────────
echo
dire "Restauration en cours…"
if ! gzip -cd "$DUMP" | mysql --defaults-extra-file="$CNF"; then
  alerter "restoreDb : ÉCHEC pendant la restauration de $MYSQL_DATABASE — base probablement dans un état intermédiaire."
  echo "  état intermédiaire. L'état précédent est dans $BACKUP_DIR/avant-restauration/" >&2
  exit 1
fi

# Repère enregistré seulement maintenant : après un échec, une reprise avec le
# même fichier doit rester possible.
echo "$DUMP_TS $DUMP_TABLES $(basename "$DUMP")" > "$ETAT_FILE"

APRES="$(mysql --defaults-extra-file="$CNF" -N -B -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$MYSQL_DATABASE'" 2>/dev/null)"
dire "restoreDb : terminé — $MYSQL_DATABASE contient $APRES table(s) (sauvegarde : $DUMP_TABLES)."

if [ "${APRES:-0}" -lt "$DUMP_TABLES" ]; then
  alerter "restoreDb : ATTENTION, moins de tables ($APRES) que dans la sauvegarde ($DUMP_TABLES). À vérifier."
  exit 1
fi
if [ "${APRES:-0}" -gt "$DUMP_TABLES" ]; then
  echo "  Note : la base contient des tables absentes de la sauvegarde. mysqldump ne"
  echo "  supprime que les tables qu'il restaure, celles créées depuis subsistent."
fi
