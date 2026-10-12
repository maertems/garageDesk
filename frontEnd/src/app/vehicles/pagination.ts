/**
 * Taille de page de la liste, dans un module SANS « use client ».
 *
 * Elle vivait dans la liste elle-même, un composant client, et la page serveur
 * l'importait de là. Or tout export d'un module client importé depuis le serveur
 * devient une référence opaque : l'API recevait `limit=[object Object]`, répondait
 * 422, et la page affichait « Chargement impossible ». `tsc` et `next build` ne
 * voient rien, la valeur n'est remplacée qu'à l'exécution.
 */
export const VEHICLES_PAGE_SIZE = 50;
