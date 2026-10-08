"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Éditeur d'un référentiel de rendez-vous : états ou catégories.
 *
 * Libellé, couleur, ordre, ajout et suppression. Avant, seule la couleur était
 * modifiable (§ 81) et le libellé vivait dans `labels.ts`, donc dans le code :
 * ajouter un état demandait un déploiement.
 *
 * **Tout est appliqué à l'enregistrement**, comme le reste de cette page. Rien ne
 * part au clic : on ajoute, on supprime, on réordonne, puis on enregistre. Une
 * ligne supprimée reste visible, barrée, et se reprend tant qu'on n'a pas
 * enregistré — la suppression d'un référentiel partagé par tous les rendez-vous
 * mérite de pouvoir se défaire.
 */

export type Entree = {
  id: number;
  code: string;
  label?: string | null;
  color?: string | null;
  sortOrder?: number;
};

/** Une ligne en cours d'édition. `id` nul = entrée pas encore créée. */
export type Ligne = {
  id: number | null;
  code: string;
  label: string;
  color: string;
  supprimee: boolean;
};

/**
 * Code technique dérivé du libellé, pour une entrée nouvelle.
 *
 * Le code n'est **pas** saisissable, et ne se modifie jamais : il est employé en
 * dur ailleurs — `AppointmentForm` cherche `mechanic` pour la catégorie par
 * défaut — et il sert de clé au repli de `labels.ts`. Le renommer casserait les
 * deux en silence.
 */
export function codeDepuisLibelle(libelle: string, existants: string[]): string {
  const base =
    libelle
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(" ")
      .map((mot, i) =>
        i === 0 ? mot.toLowerCase() : mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()
      )
      .join("") || "entree";
  if (!existants.includes(base)) return base;
  let n = 2;
  while (existants.includes(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/**
 * Couleur ramenée à un `#rrggbb`, pour l'AFFICHAGE du sélecteur.
 *
 * La colonne est un `VARCHAR(32)` sans validation et la valeur part telle quelle
 * dans le style du bloc de rendez-vous. Or `<input type="color">` n'accepte
 * qu'un `#rrggbb` et ramène silencieusement tout le reste à `#000000` : sans
 * cela, ouvrir la page proposerait du noir pour une entrée enregistrée en
 * `red`. Seules les lignes réellement modifiées sont envoyées, l'affichage
 * n'écrase donc rien de lui-même.
 */
export function normaliserHex(valeur: string | null | undefined, defaut: string): string {
  const v = (valeur ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (court) {
    return `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`.toLowerCase();
  }
  return defaut;
}

export function lignesDepuis(entrees: Entree[], couleurDefaut: string): Ligne[] {
  return entrees.map((e) => ({
    id: e.id,
    code: e.code,
    // Un libellé absent retombe sur le code : lisible, et c'est ce que fera
    // l'API tant que la migration 032 n'est pas jouée.
    label: (e.label ?? "").trim() || e.code,
    color: normaliserHex(e.color, couleurDefaut),
    supprimee: false,
  }));
}

export default function ReferentielEditor({
  titre,
  note,
  prefixe,
  lignes,
  onChange,
  apercu,
  couleurDefaut,
  fondApercu,
  enregistrement,
}: {
  titre: string;
  note: string;
  /** Préfixe des identifiants ARIA et des libellés d'accessibilité. */
  prefixe: string;
  lignes: Ligne[];
  onChange: (lignes: Ligne[]) => void;
  /** Comment le calendrier emploie la couleur : fond du bloc, ou bordure gauche. */
  apercu: "fond" | "bordure";
  couleurDefaut: string;
  /** Fond de l'aperçu quand la couleur sert de bordure. */
  fondApercu: string;
  enregistrement: boolean;
}) {
  const [nouveauLibelle, setNouveauLibelle] = useState("");

  const modifier = (i: number, champ: Partial<Ligne>) =>
    onChange(lignes.map((l, j) => (j === i ? { ...l, ...champ } : l)));

  // L'ordre est celui du tableau ; `sortOrder` est recalculé à l'enregistrement.
  // Déplacer une ligne plutôt que saisir un nombre : personne ne veut gérer des
  // dizaines à la main.
  const deplacer = (i: number, pas: -1 | 1) => {
    const j = i + pas;
    if (j < 0 || j >= lignes.length) return;
    const copie = [...lignes];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    onChange(copie);
  };

  function ajouter() {
    const libelle = nouveauLibelle.trim();
    if (!libelle) return;
    onChange([
      ...lignes,
      {
        id: null,
        code: codeDepuisLibelle(libelle, lignes.map((l) => l.code)),
        label: libelle,
        color: couleurDefaut,
        supprimee: false,
      },
    ]);
    setNouveauLibelle("");
  }

  const vivantes = lignes.filter((l) => !l.supprimee).length;

  return (
    <section className="rounded-lg border bg-card overflow-hidden">
      <header className="px-4 py-2 border-b bg-secondary/40">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {titre}
        </h3>
      </header>
      <div className="p-4">
        <p className="mb-3 text-xs text-muted-foreground">{note}</p>

        <div className="space-y-2">
          {lignes.map((l, i) => (
            <div
              key={l.id ?? `nouvelle-${i}`}
              className={cn(
                "flex items-center gap-2",
                l.supprimee && "opacity-50"
              )}
            >
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => deplacer(i, -1)}
                  disabled={i === 0 || l.supprimee}
                  aria-label="Monter"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => deplacer(i, 1)}
                  disabled={i === lignes.length - 1 || l.supprimee}
                  aria-label="Descendre"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              <input
                type="color"
                aria-label={`Couleur de ${l.label || l.code}`}
                value={l.color}
                disabled={l.supprimee}
                onChange={(e) => modifier(i, { color: e.target.value })}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1 disabled:cursor-not-allowed"
              />

              <Input
                aria-label={`Libellé de ${l.code}`}
                value={l.label}
                disabled={l.supprimee}
                onChange={(e) => modifier(i, { label: e.target.value })}
                className={cn("flex-1", l.supprimee && "line-through")}
              />

              <span
                className="w-32 shrink-0 truncate rounded px-2 py-0.5 text-[11px] font-medium"
                style={
                  apercu === "fond"
                    ? { background: l.color }
                    : { background: fondApercu, borderLeft: `6px solid ${l.color}` }
                }
              >
                {l.label || l.code}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => modifier(i, { supprimee: !l.supprimee })}
                title={l.supprimee ? "Reprendre" : "Supprimer"}
                aria-label={
                  l.supprimee
                    ? `Reprendre ${l.label || l.code}`
                    : `Supprimer ${l.label || l.code}`
                }
              >
                {l.supprimee ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
          ))}
        </div>

        {vivantes === 0 && (
          <p className="mt-3 text-xs text-destructive">
            Il ne reste aucune entrée. Les rendez-vous n&apos;auront plus rien à choisir.
          </p>
        )}

        <div className="mt-4 flex items-end gap-2 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={`${prefixe}-nouveau`} className="text-xs">
              Ajouter
            </Label>
            <Input
              id={`${prefixe}-nouveau`}
              value={nouveauLibelle}
              placeholder="Libellé de la nouvelle entrée"
              onChange={(e) => setNouveauLibelle(e.target.value)}
              // Entrée ajoute la ligne au lieu d'enregistrer le formulaire entier.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ajouter();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={ajouter}
            disabled={!nouveauLibelle.trim() || enregistrement}
          >
            {enregistrement ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Ajouter
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Rien n&apos;est appliqué avant d&apos;avoir enregistré, suppressions comprises.
        </p>
      </div>
    </section>
  );
}
