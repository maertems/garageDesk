"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Recherche d'un client, avec liste de suggestions et navigation au clavier.
 *
 * Ce contrôle était écrit QUATRE fois — rendez-vous, réservation de prêt, fiche
 * véhicule, nouveau document — avec quatre balisages différents, et aucun des
 * quatre ne répondait aux flèches du clavier. Les corriger un par un aurait fait
 * quatre copies à maintenir et la cinquième aurait été écrite sans clavier elle
 * aussi. Il n'y a donc plus qu'une implémentation, et les différences entre les
 * appelants sont devenues des paramètres.
 *
 * Le composant possède le texte saisi, l'ouverture de la liste, le filtre, la
 * fermeture au clic extérieur et le clavier. L'appelant garde ce qui lui est
 * propre : la liste des clients, la façon de les nommer, et ce que choisir veut
 * dire chez lui (rattacher un véhicule, par exemple).
 */

export type PickableClient = { id: number };

type ClientPickerProps<T extends PickableClient> = {
  clients: T[];
  /** Identifiant choisi. Le champ affiche son libellé. */
  value: number | "" | null;
  /** La fiche choisie, ou `null` quand une frappe annule le choix. */
  onChange: (client: T | null) => void;
  /** Texte d'une ligne, et du champ une fois le choix fait. */
  label: (c: T) => string;
  /**
   * Texte dans lequel on cherche. Par défaut le libellé — à surcharger pour
   * accepter « nom prénom » ET « prénom nom », ce que faisait le formulaire de
   * rendez-vous et lui seul.
   */
  haystack?: (c: T) => string;
  /** Longueur de saisie à partir de laquelle la liste s'ouvre. 0 = tout au focus. */
  minChars?: number;
  maxItems?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Loupe à gauche du champ (fiche véhicule). */
  withIcon?: boolean;
  /**
   * Texte affiché quand la recherche ne rend rien. Sans lui, la liste reste
   * simplement fermée — c'est ce que faisaient trois des quatre appelants.
   */
  emptyLabel?: string;
  inputClassName?: string;
  /** Préfixe des identifiants ARIA, à changer si deux champs coexistent. */
  idPrefix?: string;
};

export default function ClientPicker<T extends PickableClient>({
  clients,
  value,
  onChange,
  label,
  haystack,
  minChars = 3,
  maxItems = 20,
  placeholder = "Rechercher un client…",
  disabled = false,
  withIcon = false,
  emptyLabel,
  inputClassName,
  idPrefix = "client",
}: ClientPickerProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Ligne visée par le clavier. -1 = aucune : la liste s'ouvre sans présélection,
  // sinon une Entrée involontaire choisirait un client à la place de la saisie.
  const [actif, setActif] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Une référence par ligne, pour la ramener dans la partie visible : la liste
  // défile au-delà de quelques résultats.
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]);

  const selected = useMemo(
    () => (value === "" || value == null ? null : clients.find((c) => c.id === value) ?? null),
    [clients, value]
  );

  // Le champ affiche le libellé du client choisi. Les fiches arrivant par un appel
  // asynchrone, ce rattrapage doit dépendre de `clients` : à la modification d'un
  // rendez-vous, l'identifiant est connu avant les noms.
  useEffect(() => {
    if (selected) setQuery(label(selected));
    else if (value === "" || value == null) setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < minChars) return minChars === 0 ? clients.slice(0, maxItems) : [];
    const cherche = (c: T) => (haystack ? haystack(c) : label(c)).toLowerCase();
    const base = clients.filter((c) => cherche(c).includes(q)).slice(0, maxItems);
    // Le client déjà choisi reste proposé même s'il sort du filtre : sans cela, en
    // modification, la liste s'ouvrait sans contenir la fiche en cours.
    if (selected && !base.some((c) => c.id === selected.id)) {
      return [selected, ...base].slice(0, maxItems);
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, query, minChars, maxItems, selected]);

  // La ligne visée doit rester visible. `block: "nearest"` fait défiler du strict
  // minimum ; avec `"center"`, la liste sautait à chaque flèche.
  useEffect(() => {
    if (actif < 0) return;
    optionsRef.current[actif]?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  // Une liste raccourcie laisserait un index dans le vide.
  useEffect(() => {
    if (actif >= filtered.length) setActif(-1);
  }, [filtered.length, actif]);

  // Clic à l'extérieur : on referme et on remet le libellé du client choisi, sinon
  // le champ garderait une recherche qui ne correspond à rien de sélectionné.
  useEffect(() => {
    function auClic(e: MouseEvent) {
      if (!containerRef.current || containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
      setActif(-1);
      setQuery(selected ? label(selected) : "");
    }
    document.addEventListener("mousedown", auClic);
    return () => document.removeEventListener("mousedown", auClic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Échap doit refermer la LISTE, et elle seule. Trois de ces formulaires vivent
  // dans une boîte de dialogue Radix, qui écoute Échap sur `document` en phase de
  // CAPTURE (`react-dismissable-layer`) : un `stopPropagation` depuis le
  // gestionnaire React, qui court en bouillonnement, arrive après coup — le
  // dialogue se fermait, emportant le formulaire et la saisie. La capture
  // traversant `window` AVANT `document`, on intercepte là, et seulement pendant
  // que la liste est ouverte.
  //
  // Mesuré : sans cet effet, Échap sur la réservation de prêt ramenait à la liste
  // des véhicules.
  useEffect(() => {
    if (!open) return;
    function auClavierCapture(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActif(-1);
    }
    window.addEventListener("keydown", auClavierCapture, true);
    return () => window.removeEventListener("keydown", auClavierCapture, true);
  }, [open]);

  function choisir(c: T) {
    onChange(c);
    setQuery(label(c));
    setOpen(false);
    setActif(-1);
  }

  const listeVisible = open && (filtered.length > 0 || (!!emptyLabel && query.trim().length >= minChars));

  function auClavier(e: React.KeyboardEvent<HTMLInputElement>) {
    const assezLong = query.trim().length >= minChars;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Sans cela, le curseur file au début ou à la fin du texte saisi.
      e.preventDefault();
      if (!open && assezLong) {
        setOpen(true);
        setActif(e.key === "ArrowDown" ? 0 : filtered.length - 1);
        return;
      }
      if (!open || filtered.length === 0) return;
      setActif((i) => {
        const n = filtered.length;
        if (e.key === "ArrowDown") return i < 0 ? 0 : (i + 1) % n;
        return i <= 0 ? n - 1 : i - 1;
      });
      return;
    }

    if (e.key === "Enter") {
      // Le champ vit dans un formulaire : sans preventDefault, Entrée
      // enregistrerait au lieu de choisir.
      if (open && actif >= 0 && filtered[actif]) {
        e.preventDefault();
        choisir(filtered[actif]);
      }
      return;
    }

    // Échap est traité ailleurs, sur `window` en phase de capture — voir l'effet
    // plus haut et la raison qui l'impose.

    if (e.key === "Tab" && open) {
      setOpen(false);
      setActif(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {withIcon && (
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        )}
        <Input
          ref={inputRef}
          type="text"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(withIcon && "pl-8", inputClassName)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActif(-1);
            onChange(null);
            setOpen(e.target.value.trim().length >= minChars);
          }}
          onFocus={() => {
            if (query.trim().length >= minChars) setOpen(true);
          }}
          onKeyDown={auClavier}
          role="combobox"
          aria-expanded={listeVisible}
          aria-controls={`${idPrefix}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={actif >= 0 ? `${idPrefix}-option-${actif}` : undefined}
        />
      </div>

      {listeVisible && (
        <div
          id={`${idPrefix}-liste`}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">{emptyLabel}</div>
          ) : (
            filtered.map((c, i) => (
              <div
                key={c.id}
                id={`${idPrefix}-option-${i}`}
                role="option"
                aria-selected={i === actif}
                ref={(el) => {
                  optionsRef.current[i] = el;
                }}
                // `onMouseDown` avec preventDefault, et non `onClick` : le clic
                // arriverait après le flou du champ, qui referme la liste.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(c);
                }}
                onMouseEnter={() => setActif(i)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm hover:bg-accent",
                  i === actif && "bg-accent",
                  selected?.id === c.id && "font-semibold"
                )}
              >
                {label(c)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
