"""Chaque `cur.execute(requête, args)` doit porter autant de `%s` que d'arguments.

Classe d'erreur invisible partout ailleurs : le module s'importe, les types sont
bons, aucun outil statique ne bronche — et la requête lève un
`TypeError: not all arguments converted during string formatting` à l'exécution,
rendu en 500.

C'est arrivé le 24 août 2026 sur la création de client : la colonne
`accountNumber` et sa valeur avaient été ajoutées à l'INSERT, le `%s`
correspondant non. La création d'un client depuis l'intranet était cassée depuis,
et seule la trace d'une pile dans le conteneur le disait.

Le contrôle est fait par l'AST, et ne porte que sur les appels VÉRIFIABLES : une
requête constante et des arguments en tuple ou liste littérale. Les requêtes
construites dynamiquement (clauses SET assemblées, `IN (%s, %s, …)`) sont hors de
portée et sont ignorées — mieux vaut un garde-fou partiel et sûr qu'un contrôle
qui crie au loup.
"""
import ast
import pathlib

import pytest

RACINE = pathlib.Path(__file__).resolve().parent.parent / "app"


def _appels_verifiables():
    """Rend (fichier, ligne, nombre de %s, nombre d'arguments, extrait)."""
    for chemin in sorted(RACINE.rglob("*.py")):
        arbre = ast.parse(chemin.read_text(encoding="utf-8"), filename=str(chemin))
        for noeud in ast.walk(arbre):
            if not (
                isinstance(noeud, ast.Call)
                and isinstance(noeud.func, ast.Attribute)
                and noeud.func.attr == "execute"
                and len(noeud.args) == 2
            ):
                continue
            requete, args = noeud.args
            # Requête constante seulement : une f-string ou une concaténation peut
            # porter un nombre de marqueurs que seul l'exécution connaît.
            if not (isinstance(requete, ast.Constant) and isinstance(requete.value, str)):
                continue
            # Arguments littéraux seulement, et sans `*liste` qui masquerait le compte.
            if not isinstance(args, (ast.Tuple, ast.List)):
                continue
            if any(isinstance(e, ast.Starred) for e in args.elts):
                continue
            yield (
                chemin.relative_to(RACINE.parent),
                noeud.lineno,
                requete.value.count("%s"),
                len(args.elts),
                " ".join(requete.value.split())[:90],
            )


def test_chaque_requete_a_autant_de_marqueurs_que_d_arguments():
    anomalies = [
        f"{fichier}:{ligne} — {marqueurs} %s pour {arguments} argument(s)\n    {extrait}…"
        for fichier, ligne, marqueurs, arguments, extrait in _appels_verifiables()
        if marqueurs != arguments
    ]
    assert not anomalies, (
        "Requêtes dont les marqueurs ne correspondent pas aux arguments.\n"
        "Elles lèvent un TypeError à l'exécution, rendu en 500 :\n\n"
        + "\n\n".join(anomalies)
    )


def test_le_controle_examine_bien_quelque_chose():
    """Garde-fou du garde-fou.

    Un test qui n'examine rien passe toujours. Si un remaniement rendait les
    requêtes non constantes — passage à un constructeur, par exemple —, le test
    ci-dessus deviendrait vert sans plus rien vérifier, et personne ne le verrait.
    """
    assert sum(1 for _ in _appels_verifiables()) > 100, (
        "trop peu d'appels examinés : le contrôle ne garde plus grand-chose"
    )


def test_la_creation_de_client_est_coherente():
    """Le cas précis qui a cassé, nommé pour qu'une régression se lise d'un coup."""
    fautifs = [
        (ligne, marqueurs, arguments)
        for fichier, ligne, marqueurs, arguments, _ in _appels_verifiables()
        if fichier.name == "clients.py" and marqueurs != arguments
    ]
    assert not fautifs, f"clients.py : {fautifs}"
