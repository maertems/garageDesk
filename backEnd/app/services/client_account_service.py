"""Attribution automatique de nos numéros de compte client.

Le garage en a deux séries, et elles ne se mélangent pas :

  * `bills.account` porte le compte du **système de facturation actuel**, poussé
    par le script extérieur. On n'y touche pas. Il mélange des numéros (préfixe
    `411`, le compte « Clients » du plan comptable français) et des libellés
    comme « CLIENTS DIVERS X Y Z » ou « Garantie constructeur » ;
  * `clients.accountNumber` porte **le nôtre**, attribué ici.

**Départ à 41105001**, choisi par le garage pour ne pas entrer en collision avec
l'existant : les comptes numériques du système actuel vont de 41101159 à 41102416,
plus un isolé à 41190000 (relevé 108 fois, vraisemblablement un compte collectif).
41105001 tombe donc dans un creux, au-dessus des comptes réels et sous le
collectif.

⚠️ **La collision reste possible à très long terme** : si le système actuel
continue d'incrémenter depuis 41102416, il atteindrait 41105001 au bout de ~2 585
clients supplémentaires. Rien ne le surveille aujourd'hui.

**Portée** : seuls les clients **saisis dans l'intranet** reçoivent un numéro.
Ceux que crée la synchronisation extérieure gardent le leur dans le système
actuel et n'ont rien de notre côté — décision du garage. Les 1 136 fiches déjà
en base restent sans numéro.
"""

PREMIER_COMPTE = 41105001


def prochain_numero_de_compte(cur) -> str:
    """Rend le prochain numéro libre, en texte.

    Déduit de l'existant (`MAX + 1`) plutôt que d'un compteur tenu à part, et
    c'est délibéré :

      * `numberingSequences`, le compteur des documents, est **vidé par
        `cleanupDb.sh`**. Y loger celui-ci le ferait repartir à 41105001 et
        réattribuer des numéros déjà donnés — une collision silencieuse sur des
        données comptables ;
      * un compteur peut dériver de la réalité ; ici l'état EST la donnée, il ne
        peut pas se désynchroniser.

    Le revers assumé : supprimer le client le plus récent libère son numéro pour
    le suivant. Marginal, et sans conséquence tant qu'aucune facture n'a été
    émise — une fiche facturée ne se supprime pas.

    Verrou : l'appelant doit fournir un curseur de `db_transaction`, le `FOR
    UPDATE` ne tenant que dans une transaction. Deux créations simultanées
    seraient sinon servies le même numéro — et l'index unique posé par la
    migration 030 ferait alors échouer la seconde plutôt que de créer un doublon.

    Ne considère que les valeurs **purement numériques** : une saisie manuelle
    fantaisiste ne doit pas décaler la série.
    """
    cur.execute(
        """
        SELECT MAX(CAST(accountNumber AS UNSIGNED)) AS maxi
          FROM clients
         WHERE accountNumber REGEXP '^[0-9]+$'
         FOR UPDATE
        """
    )
    ligne = cur.fetchone()
    maxi = ligne["maxi"] if ligne else None
    if maxi is None or int(maxi) < PREMIER_COMPTE:
        return str(PREMIER_COMPTE)
    return str(int(maxi) + 1)
