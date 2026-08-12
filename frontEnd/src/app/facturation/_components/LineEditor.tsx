"use client";

/**
 * Éditeur de lignes partagé (devis / avenant / vente directe).
 * Calcul LOCAL des totaux pour le feedback à l'écran ; le backend reste
 * l'autorité sur les montants (cf. services/billing_totals.py).
 * La colonne Référence propose une autocomplétion sur le catalogue
 * (/articles) : sélectionner un article renseigne désignation, prix, unité,
 * TVA et type — la désignation reste ensuite librement modifiable.
 * Lots ultérieurs : réordonnancement drag (@dnd-kit déjà dans package.json).
 */

import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type LineDraft = {
  id?: number;
  sortOrder: number;
  lineType: string | null;
  articleId: number | null;
  label: string;
  longDescription: string | null;
  quantity: number;
  unitCode: string | null;
  unitPriceHt: number;
  discountPercent: number;
  vatRate: number;
  facturXVatCategory: string;
};

export type LineComputed = {
  discountAmount: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
};

export type DocumentTotals = {
  subtotalHt: number;
  globalDiscountPercent: number;
  globalDiscountAmount: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
};

type ArticleOption = {
  id: number;
  reference: string | null;
  type: string | null;
  label: string;
  unitCode: string;
  vatRateId: number | null;
  price: number;
};

type VatRateOption = {
  id: number;
  rate: number;
  facturXCategory: string;
};

/** Arrondi commercial à n décimales (mirroir de billing_totals._r2/_r4). */
function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Calcul d'une ligne — affichage uniquement, le backend recalcule à la sauvegarde. */
export function computeLine(line: LineDraft): LineComputed {
  const gross = line.quantity * line.unitPriceHt;
  const discountAmount = round((gross * line.discountPercent) / 100, 4);
  const totalHt = round(gross - discountAmount, 2);
  const totalVat = round((totalHt * line.vatRate) / 100, 2);
  return { discountAmount, totalHt, totalVat, totalTtc: round(totalHt + totalVat, 2) };
}

/** Totaux document — remise globale appliquée sur le sous-total HT. */
export function computeTotals(lines: LineDraft[], globalDiscountPercent: number): DocumentTotals {
  const subtotalHt = round(lines.reduce((s, l) => s + computeLine(l).totalHt, 0), 2);
  const globalDiscountAmount = round((subtotalHt * globalDiscountPercent) / 100, 2);
  const totalHt = round(subtotalHt - globalDiscountAmount, 2);
  const factor = globalDiscountPercent ? 1 - globalDiscountPercent / 100 : 1;
  const totalVat = round(
    lines.reduce((s, l) => s + computeLine(l).totalHt * factor * (l.vatRate / 100), 0),
    2
  );
  return {
    subtotalHt,
    globalDiscountPercent,
    globalDiscountAmount,
    totalHt,
    totalVat,
    totalTtc: round(totalHt + totalVat, 2),
  };
}

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export function emptyLine(sortOrder: number): LineDraft {
  return {
    sortOrder,
    lineType: null,
    articleId: null,
    label: "",
    longDescription: null,
    quantity: 1,
    unitCode: "unit",
    unitPriceHt: 0,
    discountPercent: 0,
    vatRate: 20,
    facturXVatCategory: "S",
  };
}

/** Combobox Référence : autocomplétion sur le catalogue d'articles.
 *
 * Le dropdown est rendu via un portail (document.body), positionné en
 * `fixed`, car la table des lignes défile horizontalement
 * (`overflow-x-auto`) — un dropdown positionné en absolu à l'intérieur
 * serait coupé/invisible (même problème que la section 23 de
 * MODIFICATIONS-DEPUIS-EXECUTION-PLAN.md, résolu ici via un portail plutôt
 * qu'en retirant l'overflow, qui reste nécessaire au défilement du tableau).
 */
function ReferenceCell({
  articleId,
  articles,
  disabled,
  onPick,
}: {
  articleId: number | null;
  articles: ArticleOption[];
  disabled: boolean;
  onPick: (article: ArticleOption) => void;
}) {
  const linkedArticle = articles.find((a) => a.id === articleId) ?? null;
  const [query, setQuery] = useState(linkedArticle?.reference ?? "");
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resynchronise le texte affiché quand la ligne change de l'extérieur
  // (sélection ailleurs, réinitialisation) OU quand le catalogue arrive après
  // le montage (fetch asynchrone dans LineEditor — au premier rendu d'une
  // ligne existante, `articles` peut encore être vide), sauf pendant une
  // frappe active.
  useEffect(() => {
    if (!open) setQuery(linkedArticle?.reference ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, articles]);

  // La position en `fixed` du dropdown ne suit pas un éventuel scroll de la
  // page pendant qu'il est ouvert : on le referme plutôt que de le laisser
  // se désaligner.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  function openDropdown() {
    const r = inputRef.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) });
    setOpen(true);
  }

  // Tous les hooks doivent être appelés avant tout retour conditionnel (Rules
  // of Hooks) — sinon le nombre de hooks change entre le rendu "non
  // verrouillé" et "verrouillé" (ex. juste après avoir choisi une référence
  // dans le dropdown, dans le même cycle de rendu) et React plante.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles.slice(0, 20);
    return articles
      .filter((a) => (a.reference ?? "").toLowerCase().includes(q) || a.label.toLowerCase().includes(q))
      .slice(0, 20);
  }, [articles, query]);

  // Une fois une référence liée à la ligne, elle ne peut plus être changée
  // (il faut supprimer la ligne et en recréer une pour en choisir une autre) —
  // seules les lignes libres (sans article) restent recherchables.
  if (disabled || articleId != null) {
    return <Input value={linkedArticle?.reference ?? ""} disabled className="font-mono text-xs" />;
  }

  function confirmPick(a: ArticleOption) {
    onPick(a);
    setQuery(a.reference ?? "");
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={query}
        placeholder="Réf."
        className="font-mono text-xs"
        onChange={(e) => {
          setQuery(e.target.value);
          openDropdown();
        }}
        onFocus={openDropdown}
        onKeyDown={(e) => {
          // Entrée/Tab valide directement la 1ère suggestion (la seule
          // restante s'il n'y en a qu'une) sans avoir à cliquer.
          if ((e.key === "Enter" || e.key === "Tab") && open && filtered.length > 0) {
            if (e.key === "Enter") e.preventDefault();
            confirmPick(filtered[0]);
          }
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            setQuery(linkedArticle?.reference ?? "");
          }, 150);
        }}
      />
      {open && rect && filtered.length > 0 && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  confirmPick(a);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
              >
                <span className="font-mono">{a.reference || "—"}</span>
                <span className="text-muted-foreground ml-2">{a.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

type LineEditorProps = {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  globalDiscountPercent: number;
  onGlobalDiscountChange: (value: number) => void;
  readOnly?: boolean;
};

export default function LineEditor({
  lines,
  onChange,
  globalDiscountPercent,
  onGlobalDiscountChange,
  readOnly = false,
}: LineEditorProps) {
  const totals = useMemo(() => computeTotals(lines, globalDiscountPercent), [lines, globalDiscountPercent]);

  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [vatRateById, setVatRateById] = useState<Record<number, VatRateOption>>({});

  useEffect(() => {
    fetch("/api/proxy/articles?activeOnly=true")
      .then((r) => r.json())
      .then((d) => setArticles(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/proxy/vatRates")
      .then((r) => r.json())
      .then((d: VatRateOption[]) => {
        if (!Array.isArray(d)) return;
        setVatRateById(Object.fromEntries(d.map((v) => [v.id, v])));
      })
      .catch(() => {});
  }, []);

  const update = (index: number, patch: Partial<LineDraft>) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const addLine = () => onChange([...lines, emptyLine(lines.length)]);
  const removeLine = (index: number) => onChange(lines.filter((_, i) => i !== index));

  function pickArticle(index: number, article: ArticleOption) {
    const vat = article.vatRateId != null ? vatRateById[article.vatRateId] : undefined;
    update(index, {
      articleId: article.id,
      label: article.label,
      lineType: article.type,
      unitCode: article.unitCode,
      unitPriceHt: article.price,
      ...(vat ? { vatRate: vat.rate, facturXVatCategory: vat.facturXCategory } : {}),
    });
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-medium w-32">Référence</th>
              <th className="px-2 py-2 text-left font-medium">Désignation</th>
              <th className="px-2 py-2 text-right font-medium w-20">Qté</th>
              <th className="px-2 py-2 text-right font-medium w-28">P.U. HT</th>
              <th className="px-2 py-2 text-right font-medium w-20">Remise %</th>
              <th className="px-2 py-2 text-right font-medium w-20">TVA %</th>
              <th className="px-2 py-2 text-right font-medium w-28">Total HT</th>
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const c = computeLine(line);
              return (
                <tr key={line.id ?? i} className={i % 2 === 1 ? "bg-primary/10" : ""}>
                  <td className="px-2 py-1.5">
                    <ReferenceCell
                      articleId={line.articleId}
                      articles={articles}
                      disabled={readOnly}
                      onPick={(a) => pickArticle(i, a)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      value={line.label}
                      disabled={readOnly}
                      onChange={(e) => update(i, { label: e.target.value })}
                      placeholder="Libellé de la ligne"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      className="text-right no-spinner"
                      value={line.quantity}
                      disabled={readOnly}
                      onChange={(e) => update(i, { quantity: num(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      className="text-right no-spinner"
                      value={line.unitPriceHt}
                      disabled={readOnly}
                      onChange={(e) => update(i, { unitPriceHt: num(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      className="text-right no-spinner"
                      value={line.discountPercent}
                      disabled={readOnly}
                      onChange={(e) => update(i, { discountPercent: num(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input
                      type="number"
                      className="text-right no-spinner"
                      value={line.vatRate}
                      disabled={readOnly}
                      onChange={(e) => update(i, { vatRate: num(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{eur(c.totalHt)}</td>
                  {!readOnly && (
                    <td className="px-2 py-1.5 text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label="Supprimer la ligne">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="px-2 py-4 text-center text-muted-foreground">
                  Aucune ligne.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addLine}>
          <Plus className="h-4 w-4" /> Ajouter une ligne
        </Button>
      )}

      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sous-total HT</span>
            <span className="tabular-nums">{eur(totals.subtotalHt)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Remise globale %</span>
            <Input
              type="number"
              className="h-7 w-20 text-right no-spinner"
              value={globalDiscountPercent}
              disabled={readOnly}
              onChange={(e) => onGlobalDiscountChange(num(e.target.value))}
            />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total HT</span>
            <span className="tabular-nums">{eur(totals.totalHt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">TVA</span>
            <span className="tabular-nums">{eur(totals.totalVat)}</span>
          </div>
          <div className="flex justify-between border-t pt-1 font-semibold">
            <span>Total TTC</span>
            <span className="tabular-nums">{eur(totals.totalTtc)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
