"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unitCodeLabels } from "@/lib/labels";
import type { Article, VatRate } from "./CataloguePage";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (article: Article) => void;
  initial: Article | null;
  vatRates: VatRate[];
};

const UNIT_CODES = ["hour", "liter", "kilogram", "unit"] as const;

export default function ArticleFormModal({ open, onClose, onSaved, initial, vatRates }: Props) {
  const isEdit = !!initial;

  const [reference, setReference] = useState("");
  const [type, setType] = useState("");
  const [label, setLabel] = useState("");
  const [unitCode, setUnitCode] = useState("unit");
  const [vatRateId, setVatRateId] = useState<string>("");
  const [price, setPrice] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReference(initial?.reference ?? "");
    setType(initial?.type ?? "");
    setLabel(initial?.label ?? "");
    setUnitCode(initial?.unitCode ?? "unit");
    setVatRateId(initial?.vatRateId != null ? String(initial.vatRateId) : "");
    setPrice(initial?.price != null ? String(initial.price) : "0");
    setIsActive(initial?.isActive ?? true);
    setError("");
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setError("La désignation est obligatoire."); return; }
    setError("");
    setSaving(true);

    const body: Record<string, unknown> = {
      label: label.trim(),
      unitCode,
      price: parseFloat(price) || 0,
    };
    if (reference.trim()) body.reference = reference.trim();
    if (type.trim()) body.type = type.trim();
    if (vatRateId) body.vatRateId = Number(vatRateId);
    if (isEdit) body.isActive = isActive;

    const url = isEdit ? `/api/proxy/articles/${initial!.id}` : "/api/proxy/articles";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur");
      return;
    }
    const data = await res.json();
    onSaved(data as Article);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{isEdit ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="art-label">Désignation *</Label>
            <Input
              id="art-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. : Main d'œuvre mécanique"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="art-ref">Référence</Label>
              <Input
                id="art-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                placeholder="Ex. : LABOR-MECH"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-type">Type</Label>
              <Input
                id="art-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Ex. : labor, parts…"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unité</Label>
              <Select value={unitCode} onValueChange={setUnitCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_CODES.map((u) => (
                    <SelectItem key={u} value={u}>{unitCodeLabels[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="art-price">Prix HT</Label>
              <Input
                id="art-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="text-right"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Taux de TVA</Label>
            <Select value={vatRateId} onValueChange={setVatRateId}>
              <SelectTrigger>
                <SelectValue placeholder="— Aucun —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Aucun —</SelectItem>
                {vatRates.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>
                    {v.label} ({v.rate} %)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="art-active"
                type="checkbox"
                className="h-4 w-4 accent-primary cursor-pointer"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <Label htmlFor="art-active" className="cursor-pointer">Article actif</Label>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
