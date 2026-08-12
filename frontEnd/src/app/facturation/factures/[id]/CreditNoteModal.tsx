"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { refundMethodLabels, getLabel } from "@/lib/labels";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (cnId: number) => void;
  invoiceId: number;
};

const REFUND_METHODS = ["commercialCredit", "wireTransferRefund", "cashRefund", "other"];

export default function CreditNoteModal({ open, onClose, onSaved, invoiceId }: Props) {
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("commercialCredit");
  const [refundedAt, setRefundedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setRefundMethod("commercialCredit");
    setRefundedAt("");
    setError("");
  }, [open]);

  async function handleSave() {
    if (!reason.trim()) { setError("Le motif est obligatoire."); return; }
    setError("");
    setSaving(true);

    const r = await fetch("/api/proxy/creditNotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceInvoiceId: invoiceId,
        reason: reason.trim(),
        refundMethod,
        refundedAt: refundedAt || null,
        lines: [],  // full credit note — copies all invoice lines
      }),
    });

    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de la création de l'avoir.");
      return;
    }
    const cn = await r.json();
    onSaved(cn.id);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un avoir</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Un avoir total sera créé en reprenant toutes les lignes de la facture.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="cn-reason">Motif *</Label>
            <Textarea
              id="cn-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Prestation non conforme, annulation commande…"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Mode de remboursement</Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFUND_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{getLabel(refundMethodLabels, m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cn-refunded">Date de remboursement (optionnel)</Label>
            <Input
              id="cn-refunded"
              type="date"
              value={refundedAt}
              onChange={(e) => setRefundedAt(e.target.value)}
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
          <Button onClick={handleSave} disabled={saving} className="bg-red-700 hover:bg-red-800 text-white">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Émettre l'avoir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
