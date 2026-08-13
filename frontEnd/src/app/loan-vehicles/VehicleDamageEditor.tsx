"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CAR_H,
  CAR_W,
  DAMAGE_COLS,
  DAMAGE_ROWS,
  DAMAGE_TYPES,
  WHEELS_X,
  WHEELS_Y,
  WHEEL_H,
  WHEEL_W,
  ZONES,
  cellCenter,
  damageLocationLabel,
  damageTypeLabels,
  elementLabels,
  isGlass,
  type DamageCol,
  type DamageElement,
  type DamageRow,
  type DamageType,
  type LoanVehicleDamage,
} from "@/lib/loanDamage";

const ELEMENTS = Object.keys(ZONES) as DamageElement[];

/** Rayon du marqueur, en unités du repère 100 × 240 (≈ le 1,5 mm du contrat). */
const MARKER_R = 2.9;

/** Repris du contrat PDF : les éléments centraux ont la place d'une étiquette. */
const ZONE_CAPTIONS: Partial<Record<DamageElement, string>> = {
  hood: "Capot",
  windshield: "Pare-brise",
  roof: "Toit",
  rearWindow: "Lunette",
  trunk: "Coffre",
};

type Draft = { element: DamageElement; cellRow: DamageRow; cellCol: DamageCol };

export default function VehicleDamageEditor({ vehicleId }: { vehicleId: number }) {
  const [damages, setDamages] = useState<LoanVehicleDamage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<DamageElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [type, setType] = useState<DamageType>("scratch");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/proxy/loanVehicles/${vehicleId}/damages`);
    if (!res.ok) {
      setError("Impossible de charger les dégâts.");
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => []);
    setDamages(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Numérotation stable, alignée sur celle du contrat : l'ordre de la liste
  // renvoyée par l'API (élément, ligne, colonne, id) fait foi.
  const numbered = useMemo(
    () => damages.map((d, i) => ({ ...d, n: i + 1 })),
    [damages]
  );

  // Marqueurs regroupés par case : plusieurs dégâts au même endroit sont
  // légitimes (rayure ET enfoncement), on les écarte au lieu de les superposer.
  const markerGroups = useMemo(() => {
    const groups = new Map<string, typeof numbered>();
    for (const d of numbered) {
      const key = `${d.element}|${d.cellRow}|${d.cellCol}`;
      groups.set(key, [...(groups.get(key) ?? []), d]);
    }
    return [...groups.values()];
  }, [numbered]);

  async function addDamage() {
    if (!draft) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/proxy/loanVehicles/${vehicleId}/damages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, type, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur à l'enregistrement du dégât.");
      return;
    }
    setDraft(null);
    setSelected(null);
    setNote("");
    setType("scratch");
    await load();
  }

  async function removeDamage(id: number) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/proxy/loanVehicles/${vehicleId}/damages/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setError("Erreur à la suppression du dégât.");
      return;
    }
    await load();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {/* ── Schéma ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-center text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">
          Avant ↑
        </p>
        <svg
          viewBox={`0 0 ${CAR_W} ${CAR_H}`}
          className="w-full max-w-[240px] mx-auto select-none"
          role="img"
          aria-label="Schéma du véhicule vu de dessus"
        >
          {/* Zones cliquables */}
          {ELEMENTS.map((code) => {
            const [x, y, w, h] = ZONES[code];
            const active = selected === code;
            return (
              <rect
                key={code}
                x={x}
                y={y}
                width={w}
                height={h}
                className={cn(
                  "cursor-pointer transition-colors",
                  active
                    ? "fill-primary/20 stroke-primary"
                    : isGlass(code)
                      ? "fill-secondary stroke-border hover:fill-primary/10"
                      : "fill-card stroke-border hover:fill-primary/10"
                )}
                strokeWidth={0.4}
                onClick={() => {
                  setSelected(code);
                  setDraft(null);
                }}
              >
                <title>{elementLabels[code]}</title>
              </rect>
            );
          })}

          {/* Étiquettes des éléments centraux */}
          {Object.entries(ZONE_CAPTIONS).map(([code, caption]) => {
            const [x, y, w, h] = ZONES[code as DamageElement];
            return (
              <text
                key={code}
                x={x + w / 2}
                y={y + 7}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground pointer-events-none"
                style={{ fontSize: 4 }}
              >
                {caption}
              </text>
            );
          })}

          {/* Contour de la caisse */}
          <rect
            x={2}
            y={2}
            width={96}
            height={236}
            rx={6}
            className="fill-none stroke-primary pointer-events-none"
            strokeWidth={1.1}
          />

          {/* Roues, purement décoratives */}
          {WHEELS_X.map((wx) =>
            WHEELS_Y.map((wy) => (
              <rect
                key={`${wx}-${wy}`}
                x={wx}
                y={wy}
                width={WHEEL_W}
                height={WHEEL_H}
                rx={1.2}
                className="fill-slate-600 stroke-slate-700 pointer-events-none"
                strokeWidth={0.3}
              />
            ))
          )}

          {/* Sous-grille 3×3 de l'élément sélectionné */}
          {selected &&
            DAMAGE_ROWS.map((row) =>
              DAMAGE_COLS.map((col) => {
                const [zx, zy, zw, zh] = ZONES[selected];
                const cw = zw / 3;
                const ch = zh / 3;
                const cx = zx + DAMAGE_COLS.indexOf(col) * cw;
                const cy = zy + DAMAGE_ROWS.indexOf(row) * ch;
                const picked =
                  draft?.element === selected && draft.cellRow === row && draft.cellCol === col;
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={cx}
                    y={cy}
                    width={cw}
                    height={ch}
                    className={cn(
                      "cursor-pointer",
                      picked ? "fill-primary/60 stroke-primary" : "fill-transparent stroke-primary/50"
                    )}
                    strokeWidth={0.3}
                    strokeDasharray="1 1"
                    onClick={() => setDraft({ element: selected, cellRow: row, cellCol: col })}
                  >
                    <title>{damageLocationLabel(row, col)}</title>
                  </rect>
                );
              })
            )}

          {/* Marqueurs des dégâts enregistrés */}
          {markerGroups.map((group) => {
            const first = group[0];
            const { x, y } = cellCenter(first.element, first.cellRow, first.cellCol, MARKER_R);
            return group.map((d, i) => {
              const dx = (i - (group.length - 1) / 2) * (MARKER_R * 2.1);
              return (
                <g key={d.id} className="pointer-events-none">
                  <circle
                    cx={x + dx}
                    cy={y}
                    r={MARKER_R}
                    className="fill-orange-600 stroke-white"
                    strokeWidth={0.5}
                  />
                  <text
                    x={x + dx}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-white font-bold"
                    style={{ fontSize: 3.2 }}
                  >
                    {d.n}
                  </text>
                </g>
              );
            });
          })}
        </svg>
      </div>

      {/* ── Saisie + liste ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {!selected && (
          <p className="text-sm text-muted-foreground">
            Cliquez un élément du schéma pour y ajouter un dégât. Les dégâts enregistrés ici sont
            pré-imprimés sur le contrat de prêt.
          </p>
        )}

        {selected && (
          <div className="rounded-md border bg-secondary/30 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {elementLabels[selected]}
                {draft && (
                  <span className="text-muted-foreground font-normal">
                    {" · "}
                    {damageLocationLabel(draft.cellRow, draft.cellCol)}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  setSelected(null);
                  setDraft(null);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {!draft ? (
              <p className="text-xs text-muted-foreground">
                Choisissez la case sur le schéma (haut / milieu / bas × gauche / milieu / droite).
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="damageType">Nature</Label>
                    <Select value={type} onValueChange={(v) => setType(v as DamageType)}>
                      <SelectTrigger id="damageType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAMAGE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {damageTypeLabels[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="damageNote">Observation</Label>
                    <Input
                      id="damageNote"
                      value={note}
                      maxLength={255}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Rayure de 15 cm, tôle marquée"
                    />
                  </div>
                </div>
                <Button type="button" size="sm" onClick={addDamage} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter le dégât
                </Button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des dégâts…
          </p>
        ) : numbered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun dégât enregistré sur ce véhicule.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {numbered.map((d) => (
              <li key={d.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[10px] font-bold text-white">
                  {d.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {elementLabels[d.element]}
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      {damageLocationLabel(d.cellRow, d.cellCol)}
                      {" · "}
                      {damageTypeLabels[d.type]}
                    </span>
                  </p>
                  {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-destructive hover:bg-destructive/10"
                  onClick={() => removeDamage(d.id)}
                  disabled={busy}
                  aria-label="Supprimer ce dégât"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
