"use client";

import { useState, useEffect } from "react";
import { Loader2, PenLine } from "lucide-react";
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
import { documentTypeLabels, getLabel } from "@/lib/labels";
import type { BillingDocument } from "./DocumentDetail";

type Props = {
  open: boolean;
  onClose: () => void;
  onSigned: (updatedDoc: BillingDocument) => void;
  documentId: number;
  documentType: string;
  documentNumber: string;
};

const SIGNER_TYPES = [
  { value: "client", label: "Client" },
  { value: "technician", label: "Technicien" },
  { value: "manager", label: "Responsable" },
];

const METHODS = [
  { value: "tabletSignature", label: "Signature tablette" },
  { value: "handwrittenScan", label: "Signature manuscrite numérisée" },
  { value: "emailApproval", label: "Approbation par e-mail" },
  { value: "smsApproval", label: "Approbation par SMS" },
];

export default function SignatureModal({ open, onClose, onSigned, documentId, documentType, documentNumber }: Props) {
  const [signerType, setSignerType] = useState("client");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [method, setMethod] = useState("tabletSignature");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSignerType("client");
    setSignerName("");
    setSignerEmail("");
    setMethod("tabletSignature");
    setError("");
  }, [open]);

  async function handleSign() {
    setError("");
    setSaving(true);

    const r = await fetch("/api/proxy/signatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        signerType,
        signerName: signerName || null,
        signerEmail: signerEmail || null,
        method,
      }),
    });

    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de la signature.");
      setSaving(false);
      return;
    }

    const rDoc = await fetch(`/api/proxy/documents/${documentId}`);
    setSaving(false);
    if (rDoc.ok) onSigned(await rDoc.json());
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Signer — {getLabel(documentTypeLabels, documentType)} {documentNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Signataire</Label>
            <Select value={signerType} onValueChange={setSignerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIGNER_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sig-name">Nom du signataire</Label>
            <Input
              id="sig-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Jean Dupont"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sig-email">E-mail (optionnel)</Label>
            <Input
              id="sig-email"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="jean.dupont@email.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Méthode de signature</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSign} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Valider la signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
