"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACCEPTED = ["image/png", "image/jpeg"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Logo imprimé sur les documents remis au client (facture, avoir, contrat de prêt).
 *
 * Section autonome plutôt qu'un champ du formulaire : le logo part en base dès
 * l'envoi, sans attendre le bouton « Enregistrer » qui, lui, écrit les champs
 * texte. Mêler les deux obligerait à garder un fichier en mémoire jusqu'à la
 * soumission pour un gain nul.
 */
export default function CompanyLogoSection({ initialHasLogo }: { initialHasLogo: boolean }) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Change à chaque remplacement pour casser le cache du navigateur sur une URL
  // identique — sans quoi l'ancien logo resterait affiché après téléversement.
  const [version, setVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    if (!ACCEPTED.includes(file.type)) {
      setError("Format non géré — un fichier PNG ou JPEG est attendu.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Fichier trop volumineux (${Math.round(file.size / 1024)} Ko) — 2 Mo maximum.`);
      return;
    }
    setBusy(true);
    // Base64 et non multipart : le proxy /api/proxy impose un corps JSON.
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => "");

    if (!dataBase64) {
      setBusy(false);
      setError("Lecture du fichier impossible.");
      return;
    }

    const res = await fetch("/api/proxy/companySettings/logo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType: file.type, dataBase64 }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur au téléversement.");
      return;
    }
    setHasLogo(true);
    setVersion((v) => v + 1);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/proxy/companySettings/logo", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Erreur à la suppression.");
      return;
    }
    setHasLogo(false);
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          Imprimé en haut à droite de tous les documents remis au client — facture, avoir,
          contrat de prêt — dans un cadre de{" "}
          <strong className="font-medium text-foreground">78 × 30 mm</strong>. L&apos;image est
          réduite pour tenir dedans sans jamais être déformée.
        </p>
        <p>
          Taille conseillée :{" "}
          <strong className="font-medium text-foreground">920 × 355 pixels</strong> pour un logo
          allongé — soit 300 dpi sur le cadre, la finesse attendue à l&apos;impression. Un logo
          carré n&apos;occupera que 30 × 30 mm, donc 355 × 355 pixels suffisent ; un format allongé
          horizontalement exploite mieux le cadre.
        </p>
        <p>
          Plus grand ne nuit pas, le fichier est seulement plus lourd ; plus petit sortira
          pixelisé. Le réglage dpi enregistré dans le fichier n&apos;a aucun effet — seul compte
          le nombre de pixels, le PDF redimensionnant l&apos;image au cadre. PNG ou JPEG, 2 Mo
          maximum.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-[57px] w-[151px] shrink-0 items-center justify-center rounded-md border bg-secondary/30">
          {hasLogo ? (
            // Proportions du cadre du PDF à l'échelle (78 × 30 mm, rapport 2,60),
            // pour montrer l'encombrement réel plutôt qu'un aperçu trompeur. Tous les
            // documents emploient désormais ce cadre unique.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/proxy/companySettings/logo?v=${version}`}
              alt="Logo de l'entreprise"
              className="max-h-[49px] max-w-[143px] object-contain"
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">Aucun logo</span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {hasLogo ? "Remplacer" : "Téléverser"}
          </Button>
          {hasLogo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              Retirer
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
