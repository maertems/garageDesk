"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { paymentMethodLabels, getLabel } from "@/lib/labels";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  invoiceId: number;
  remainingAmount: number;
};

const METHODS = ["cash", "card", "wireTransfer", "check", "sepaDebit", "other"];

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export default function PaymentModal({ open, onClose, onSaved, invoiceId, remainingAmount }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("card");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(remainingAmount > 0 ? String(remainingAmount.toFixed(2)) : "");
    setMethod("card");
    setPaidAt(todayIso());
    setReference("");
    setError("");
  }, [open, remainingAmount]);

  async function handleSave() {
    const amountNum = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError("Montant invalide.");
      return;
    }
    setError("");
    setSaving(true);

    const r = await fetch("/api/proxy/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        amount: amountNum,
        paymentMethod: method,
        paidAt: paidAt || null,
        reference: reference || null,
      }),
    });

    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de l'enregistrement.");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pm-amount">Montant (€)</Label>
            <Input
              id="pm-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Mode de paiement</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{getLabel(paymentMethodLabels, m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-date">Date de paiement</Label>
            <Input
              id="pm-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-ref">Référence (optionnel)</Label>
            <Input
              id="pm-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° chèque, virement…"
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
