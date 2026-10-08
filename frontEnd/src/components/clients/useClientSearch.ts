"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Recherche de clients côté serveur, pour `ClientPicker`.
 *
 * Quatre formulaires téléchargeaient la liste COMPLÈTE des clients à l'ouverture —
 * 1 136 fiches, et 672 Ko avec les véhicules — pour n'en choisir qu'un. C'était
 * le seul coût de l'interface qui grossissait avec la base. Ils ne demandent plus
 * que ce qui est tapé (`/clients?search=`), avec un délai après la dernière frappe,
 * et une fiche par identifiant quand le client est déjà connu (modification,
 * client présélectionné).
 *
 * Le hook tient le client choisi à part des résultats, parce que le champ doit
 * afficher son nom même quand il ne sort d'aucune recherche — à la modification,
 * l'identifiant est connu avant toute frappe. `clients` est ce que voit le
 * sélecteur : le choisi en tête, puis les résultats.
 */

export type SearchableClient = { id: number };

// Assez court pour ne pas se voir, assez long pour qu'un mot tapé d'un trait ne
// fasse qu'un appel.
const DEBOUNCE_MS = 250;

type Options<T> = {
  /** Inclure les véhicules de chaque client (`withVehicles=true`). */
  withVehicles?: boolean;
  /** Client déjà connu au montage (fiche partielle acceptée, remplacée ensuite). */
  initialSelected?: T | null;
};

export function useClientSearch<T extends SearchableClient>({
  withVehicles = false,
  initialSelected = null,
}: Options<T> = {}) {
  const [selected, setSelected] = useState<T | null>(initialSelected);
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);

  const suffix = withVehicles ? "withVehicles=true" : "";

  // Une réponse arrivée après une saisie plus récente est ignorée : « dup » puis
  // « dupont » ne doivent pas finir par afficher les résultats de « dup ».
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const search = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      const mine = ++seq.current;
      setSearching(true);
      timer.current = setTimeout(() => {
        const qs = [suffix, `search=${encodeURIComponent(query)}`].filter(Boolean).join("&");
        fetch(`/api/proxy/clients?${qs}`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => {
            if (mine !== seq.current) return;
            setResults(Array.isArray(data) ? data : []);
            setSearching(false);
          })
          .catch(() => {
            if (mine !== seq.current) return;
            setResults([]);
            setSearching(false);
          });
      }, DEBOUNCE_MS);
    },
    [suffix]
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  // Un seul appel en vol par identifiant : deux chemins peuvent demander le même
  // client à quelques millisecondes d'écart (fiche partielle, puis appel du RDV).
  const requested = useRef<number | null>(null);
  const loadById = useCallback(
    (id: number) => {
      if (requested.current === id) return;
      requested.current = id;
      const qs = suffix ? `?${suffix}` : "";
      fetch(`/api/proxy/clients/${id}${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((c: T | null) => {
          if (c && typeof c.id === "number") setSelected(c);
        })
        .catch(() => {});
    },
    [suffix]
  );

  const clients = useMemo(
    () => (selected ? [selected, ...results.filter((c) => c.id !== selected.id)] : results),
    [selected, results]
  );

  return { clients, selected, setSelected, searching, search, loadById };
}
