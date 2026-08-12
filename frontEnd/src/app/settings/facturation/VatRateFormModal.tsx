"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { vatCategoryLabels } from "@/lib/labels";
import type { VatRate } from "./CataloguePage";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (vatRate: VatRate) => void;
  initial: VatRate | null;
};

const FACTURX_CATEGORIES = ["S", "Z", "E", "AE", "K", "G", "O"] as const;

export default function VatRateFormModal({ open, onClose, onSaved, initial }: Props) {
  const isEdit = !!initial;

  const [code, setCode] = useState("");
  const [rate, setRate] = useState("0");
  const [label, setLabel] = useState("");
  const [facturXCategory, setFacturXCategory] = useState("S");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(initial?.code ?? "");
    setRate(initial?.rate != null ? String(initial.rate) : "0");
    setLabel(initial?.label ?? "");
    setFacturXCategory(initial?.facturXCategory ?? "S");
    setValidFrom(initial?.validFrom ?? "");
    setValidUntil(initial?.validUntil ?? "");
    setError("");
  }, [open, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) { setError("Le code est obligatoire."); return; }
    if (!label.trim()) { setError("Le libellé est obligatoire."); return; }
    setError("");
    setSaving(true);

    const body: Record<string, unknown> = {
      code: code.trim(),
      rate: parseFloat(rate) || 0,
      label: label.trim(),
      facturXCategory,
    };
    if (validFrom) body.validFrom = validFrom;
    if (validUntil) body.validUntil = validUntil;

    const url = isEdit ? `/api/proxy/vatRates/${initial!.id}` : "/api/proxy/vatRates";
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
    onSaved(data as VatRate);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm flex flex-col max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>{isEdit ? "Modifier le taux" : "Nouveau taux de TVA"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0 px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vr-code">Code *</Label>
              <Input
                id="vr-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex. : vatStandard"
                className="font-mono text-sm"
                disabled={isEdit}
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">Le code ne peut pas être modifié.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vr-rate">Taux (%) *</Label>
              <Input
                id="vr-rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="text-right"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vr-label">Libellé *</Label>
            <Input
              id="vr-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. : TVA 20 %"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Catégorie Factur-X</Label>
            <Select value={facturXCategory} onValueChange={setFacturXCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACTURX_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    <span className="font-mono">{c}</span>
                    {" — "}
                    {vatCategoryLabels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vr-from">Valide à partir du</Label>
              <Input
                id="vr-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vr-until">Jusqu'au</Label>
              <Input
                id="vr-until"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

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
