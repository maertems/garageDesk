"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Message commercial imprimé sur la facture, sous les lignes.
 *
 * Section autonome plutôt qu'un champ du formulaire Entreprise : la valeur vit
 * dans `settings` (clé `billingFooterMessage`, migration 028) et non dans
 * `companySettings`, donc elle s'enregistre par un autre appel. La mêler au
 * formulaire obligerait à coordonner deux requêtes derrière un seul bouton, pour
 * un gain nul — c'est le même choix que pour le logo.
 */
export default function BillingFooterSection({ initial }: { initial: string }) {
  const [message, setMessage] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);
    // PATCH settings fait un upsert : la clé est créée si la migration 028 n'a pas
    // été jouée sur cette base.
    const res = await fetch("/api/proxy/settings/billingFooterMessage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: message }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Erreur à l'enregistrement.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="space-y-3">
      <Textarea
        id="billingFooterMessage"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder="En cas de sinistre carrosserie ou bris de glace, n'hésitez pas à nous contacter."
      />
      <p className="text-xs text-muted-foreground">
        Imprimé centré sous les lignes de la facture et de l&apos;avoir, avant les mentions
        légales. Laissé vide, le bloc n&apos;apparaît pas. Il n&apos;est pas figé sur les
        documents déjà émis : le modifier change ce qui sortira des prochaines impressions,
        y compris pour une facture ancienne réimprimée.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer le message
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Enregistré.</span>}
      </div>
    </div>
  );
}
