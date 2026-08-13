"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

export default function LoanSettingsForm({ initial }: { initial?: Record<string, string> }) {
  const router = useRouter();
  const [terms, setTerms] = useState(initial?.loanContractTerms ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    // PATCH settings fait un upsert : la clé est créée si la migration 025 n'a
    // pas été jouée sur cette base.
    const res = await fetch("/api/proxy/settings/loanContractTerms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: terms }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Erreur à l'enregistrement.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Conditions du prêt</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="loanContractTerms">Texte imprimé sur le contrat</Label>
            <Textarea
              id="loanContractTerms"
              value={terms}
              onChange={(e) => {
                setTerms(e.target.value);
                setSaved(false);
              }}
              rows={16}
              className="min-h-[300px] font-mono text-xs"
              placeholder={
                "Le véhicule est prêté à titre gracieux pour la durée de l'immobilisation…\n\n" +
                "L'emprunteur s'engage à restituer le véhicule avec un niveau de carburant équivalent…"
              }
            />
            <p className="text-xs text-muted-foreground">
              Un paragraphe par ligne ; une ligne vide crée un espacement. Laissé vide, le contrat
              s'imprime sans bloc de conditions — les informations du véhicule, les relevés, les
              schémas d'état et les signatures restent présents.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Enregistré.</span>}
      </div>
    </form>
  );
}
