"""Rapprochement des clients et véhicules poussés par le script extérieur.

Le problème : les deux côtés créent. Le garage saisit un client dans l'intranet, il
n'a pas de `vmId` ; le script pousse plus tard le même client depuis l'autre
logiciel. Sans rapprochement, on obtient deux fiches pour une personne, et le
`vmId` — la seule clé commune aux deux systèmes — ne se pose jamais.

Ce module ne décide rien tout seul : il donne un score de concordance dans [0,1] et
laisse l'appelant trancher. Il ne touche pas à la base, ce qui le rend éprouvable
sans serveur.

## Ce que le score vaut, et ce qu'il ne vaut pas

Comparaison sur des chaînes NORMALISÉES (minuscules, sans accent, sans séparateur)
avec `difflib`, de la bibliothèque standard : aucune dépendance, et la faute de
frappe est tolérée — « duverge » contre « duverger » donne 0,93.

Deux verrous empêchent les rapprochements absurdes que la seule moyenne pondérée
autoriserait :

  * un **nom qui ne ressemble pas** (< NAME_GATE) écarte le candidat d'office. Sans
    lui, « Jean Dupont » et « Jean Martin », même ville, atteindraient 0,45 par le
    prénom et la ville ;
  * une **ville différente plafonne** le score sous le seuil automatique. Deux
    « Jean Dupont » dans deux villes sont probablement deux personnes.

Conséquence assumée du second : un client qui a déménagé est vu comme un inconnu, et
sera dupliqué. C'est le sens d'erreur retenu — un doublon se répare, une fusion
erronée mélange deux historiques et deux comptabilités, et ne se défait pas.

## Le véhicule se joue sur l'immatriculation

Elle est unique par construction, ce qu'aucun autre champ n'est. Égalité exacte après
normalisation ⇒ concordance ; la marque ne sert que de corroboration et **ne
rapproche jamais rien à elle seule** — il y a quarante Renault dans n'importe quelle
base de garage.
"""

from __future__ import annotations

import unicodedata
from difflib import SequenceMatcher

# Seuils. En dur plutôt qu'en réglage : ils se calibrent sur des données réelles, et
# un réglage exposé serait tourné sans qu'on sache mesurer l'effet.
MATCH = 0.90        # au-dessus : concordance, on complète les champs vides
NAME_GATE = 0.85    # en dessous, sur le nom seul : candidat écarté

# Poids du score client. Le nom porte le plus, la ville ne fait que corroborer.
W_LAST = 0.55
W_FIRST = 0.35
W_CITY = 0.10


def normalise(valeur) -> str:
    """Minuscules, sans accent, sans rien d'autre que des lettres et des chiffres.

    « Saint-Étienne » → `saintetienne`, « AB-123-CD » → `ab123cd`, « O'Neill » →
    `oneill`. Sert UNIQUEMENT à comparer : la valeur stockée n'est jamais remplacée
    par sa forme normalisée, sinon on abîmerait ce que le garage a saisi.
    """
    if valeur is None:
        return ""
    texte = unicodedata.normalize("NFKD", str(valeur))
    texte = "".join(c for c in texte if not unicodedata.combining(c))
    return "".join(c for c in texte.lower() if c.isalnum())


def similarity(a, b) -> float:
    """Ressemblance de deux valeurs normalisées, dans [0,1].

    Deux valeurs vides ne se ressemblent pas : elles ne se comparent pas. Rendre 1
    ferait concorder tous les enregistrements dont un champ manque des deux côtés.
    """
    na, nb = normalise(a), normalise(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def score_client(entrant: dict, local: dict) -> float:
    """Concordance entre un client poussé et un client de notre base.

    `entrant` et `local` portent `lastName`, `firstName`, `city`. Les poids sont
    renormalisés sur les seuls champs présents des deux côtés : un entrant sans
    prénom ne doit pas être pénalisé pour une information qu'il ne fournit pas.
    """
    s_last = similarity(entrant.get("lastName"), local.get("lastName"))
    if s_last < NAME_GATE:
        return 0.0

    paires = [(W_LAST, s_last)]
    if normalise(entrant.get("firstName")) and normalise(local.get("firstName")):
        paires.append((W_FIRST, similarity(entrant.get("firstName"), local.get("firstName"))))
    ville_entrante = normalise(entrant.get("city"))
    ville_locale = normalise(local.get("city"))
    ville_comparable = bool(ville_entrante and ville_locale)
    if ville_comparable:
        paires.append((W_CITY, similarity(entrant.get("city"), local.get("city"))))

    total = sum(p for p, _ in paires)
    score = sum(p * s for p, s in paires) / total if total else 0.0

    # Plafond sur ville différente. Appliqué après la moyenne, et non comme un poids
    # plus lourd : c'est une réserve sur la décision, pas une mesure de ressemblance.
    if ville_comparable and similarity(entrant.get("city"), local.get("city")) < 0.85:
        score = min(score, MATCH - 0.01)
    return score


def score_vehicle(entrant: dict, local: dict) -> float:
    """Concordance entre un véhicule poussé et un véhicule de notre base.

    `entrant` et `local` portent `licensePlate` et `brand`. L'immatriculation décide
    seule ; la marque n'intervient jamais en son absence.
    """
    plaque_entrante = normalise(entrant.get("licensePlate"))
    plaque_locale = normalise(local.get("licensePlate"))
    if not plaque_entrante or not plaque_locale:
        return 0.0
    if plaque_entrante == plaque_locale:
        # Marque divergente : on concorde quand même, et c'est un choix. Nos
        # informations sont réputées plus fiables que celles du script, donc on garde
        # notre marque et notre modèle et on ne complète que les trous. Une
        # immatriculation identique avec une autre marque est presque toujours une
        # donnée fausse en face, pas un autre véhicule.
        return 1.0
    return SequenceMatcher(None, plaque_entrante, plaque_locale).ratio()


def best_match(entrant: dict, candidats: list[dict], scorer) -> tuple[dict | None, float]:
    """Meilleur candidat et son score. Rend (None, 0.0) si la liste est vide.

    À égalité, le premier de la liste gagne : l'appelant l'ordonne, et un ordre
    stable — par `id` croissant — vaut mieux qu'un choix arbitraire, la fiche la plus
    ancienne étant celle qui porte l'historique.
    """
    meilleur, meilleur_score = None, 0.0
    for candidat in candidats:
        score = scorer(entrant, candidat)
        if score > meilleur_score:
            meilleur, meilleur_score = candidat, score
    return meilleur, meilleur_score


def champs_a_completer(entrant: dict, local: dict, champs: list[str]) -> dict:
    """Champs de `champs` vides côté local et renseignés côté entrant.

    Règle du projet, décidée avec le garage : **on ne remplace jamais** une valeur
    déjà saisie. Nos informations sont réputées plus fiables ; celles du script ne
    servent qu'à combler les trous. `vmId` en particulier, qui est l'ancrage sans
    lequel ce rapprochement coûteux se rejouerait à chaque envoi.
    """
    a_completer = {}
    for champ in champs:
        valeur_entrante = entrant.get(champ)
        if valeur_entrante is None or str(valeur_entrante).strip() == "":
            continue
        valeur_locale = local.get(champ)
        if valeur_locale is None or str(valeur_locale).strip() == "":
            a_completer[champ] = valeur_entrante
    return a_completer
