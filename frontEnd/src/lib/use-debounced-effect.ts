"use client";

import { useEffect, useRef } from "react";

/**
 * Lance `effet` après `delayMs` sans changement des dépendances, et saute le
 * tout premier rendu.
 *
 * Pour les listes paginées côté serveur : la page arrive déjà garnie par le
 * serveur, il ne faut pas la redemander au montage ; et une frappe dans un
 * filtre ne doit faire qu'un appel une fois le mot tapé, pas un par lettre.
 * `delayMs` à 0 lance au prochain tick (changement de page ou de tri).
 */
export function useDebouncedEffect(effet: () => void, deps: unknown[], delayMs: number) {
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    const t = setTimeout(effet, delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
