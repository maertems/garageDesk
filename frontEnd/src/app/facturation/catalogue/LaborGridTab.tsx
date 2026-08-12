"use client";

/**
 * Onglet "Main d'œuvre" — grille 3x3 (niveaux 1/2/3 × Mécanique/Peinture/
 * Tôlerie) pour éditer rapidement les tarifs horaires de main d'œuvre.
 * Stockés comme des `articles` ordinaires (référence M1..T3, unité "hour",
 * TVA 20 %) — juste présentés ici en grille plutôt qu'en liste, et exclus de
 * l'onglet Articles pour ne pas l'encombrer (voir LABOR_GRID_REFERENCES,
 * réutilisé par CataloguePage pour le filtrage).
 *
 * Pas de sauvegarde automatique par case (ça faisait "bouger" le tableau
 * pendant la saisie) : les valeurs sont saisies librement, puis tout est
 * enregistré en une fois via le bouton "Valider" sous le tableau.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Article, VatRate } from "./CataloguePage";

const CATEGORIES = [
  { key: "M", label: "Mécanique" },
  { key: "P", label: "Peinture" },
  { key: "T", label: "Tôlerie" },
] as const;

const LEVELS = [1, 2, 3] as const;

export const LABOR_GRID_REFERENCES: string[] = CATEGORIES.flatMap((c) =>
  LEVELS.map((l) => `${c.key}${l}`)
);

function referenceFor(categoryKey: string, level: number): string {
  return `${categoryKey}${level}`;
}

function labelFor(categoryLabel: string, level: number): string {
  return `Main d'œuvre ${categoryLabel} - Niveau ${level}`;
}

type Props = {
  articles: Article[];
  vatRates: VatRate[];
  isAdmin: boolean;
  onSaved: (article: Article) => void;
};

export default function LaborGridTab({ articles, vatRates, isAdmin, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const vatStandard = vatRates.find((v) => v.rate === 20) ?? null;
  const byReference = Object.fromEntries(
    articles.filter((a) => a.reference && LABOR_GRID_REFERENCES.includes(a.reference)).map((a) => [a.reference as string, a])
  );

  function displayValue(reference: string): string {
    if (reference in values) return values[reference];
    const existing = byReference[reference];
    return existing != null ? String(existing.price) : "";
  }

  async function saveCell(categoryKey: string, categoryLabel: string, level: number): Promise<string | null> {
    const reference = referenceFor(categoryKey, level);
    const raw = values[reference];
    if (raw === undefined) return null; // jamais touchée, rien à faire

    const price = raw.trim() === "" ? 0 : Number(raw);
    if (Number.isNaN(price)) return `${reference} : valeur invalide`;

    const existing = byReference[reference];
    if (existing && existing.price === price) return null; // inchangée

    const body: Record<string, unknown> = {
      reference,
      label: labelFor(categoryLabel, level),
      type: "labor",
      unitCode: "hour",
      price,
      ...(vatStandard ? { vatRateId: vatStandard.id } : {}),
    };

    const url = existing ? `/api/proxy/articles/${existing.id}` : "/api/proxy/articles";
    const method = existing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return `${reference} : ${d.detail?.message ?? d.message ?? "erreur"}`;
    }
    const saved = await res.json();
    onSaved(saved as Article);
    return null;
  }

  async function handleValidate() {
    setError("");
    setSaving(true);
    const errors: string[] = [];
    for (const c of CATEGORIES) {
      for (const level of LEVELS) {
        const err = await saveCell(c.key, c.label, level);
        if (err) errors.push(err);
      }
    }
    setSaving(false);
    if (errors.length > 0) setError(errors.join(" · "));
  }

  const hasPendingChanges = Object.keys(values).length > 0;

  return (
    <div className="space-y-3">
      {!vatStandard && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Aucun taux de TVA à 20 % trouvé dans l&apos;onglet « Taux de TVA » — créez-le d&apos;abord pour pouvoir enregistrer ces tarifs.
        </p>
      )}
      <div className="inline-block rounded-xl border bg-card shadow-card overflow-hidden">
        <table className="text-sm table-fixed">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-20">Niveau</th>
              {CATEGORIES.map((c) => (
                <th key={c.key} className="px-3 py-2 text-center font-medium w-40">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((level, idx) => (
              <tr key={level} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                <td className="px-3 py-2 font-medium text-muted-foreground w-20">Niveau {level}</td>
                {CATEGORIES.map((c) => {
                  const reference = referenceFor(c.key, level);
                  return (
                    <td key={reference} className="px-3 py-2 w-40">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground w-7 shrink-0">{reference}</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={!isAdmin || !vatStandard}
                          value={displayValue(reference)}
                          onChange={(e) => setValues((v) => ({ ...v, [reference]: e.target.value }))}
                          className="no-spinner text-right w-16 shrink-0"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">€/h</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <Button onClick={handleValidate} disabled={saving || !hasPendingChanges || !vatStandard}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Valider
        </Button>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
