"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import VehicleDamageEditor from "./VehicleDamageEditor";

type LoanVehicleRecord = {
  id?: number;
  brand?: string;
  model?: string;
  licensePlate?: string;
  mileage?: number;
  uniqueNumber?: string;
};

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

export default function LoanVehicleForm({ initial }: { initial?: LoanVehicleRecord | null }) {
  const router = useRouter();
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [licensePlate, setLicensePlate] = useState(initial?.licensePlate ?? "");
  const [mileage, setMileage] = useState(initial?.mileage != null ? String(initial.mileage) : "");
  const [uniqueNumber, setUniqueNumber] = useState(initial?.uniqueNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = initial?.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!licensePlate.trim() || !uniqueNumber.trim()) {
      setError("Plaque et numéro unique sont obligatoires.");
      return;
    }
    setSaving(true);
    const body = {
      brand: brand || undefined,
      model: model || undefined,
      licensePlate: licensePlate.trim(),
      mileage: mileage ? parseInt(mileage, 10) : undefined,
      uniqueNumber: uniqueNumber.trim(),
    };
    const url = id ? `/api/proxy/loanVehicles/${id}` : "/api/proxy/loanVehicles";
    const method = id ? "PATCH" : "POST";
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
    router.push("/loan-vehicles");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Identification</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="uniqueNumber">Numéro unique *</Label>
              <Input
                id="uniqueNumber"
                value={uniqueNumber}
                onChange={(e) => setUniqueNumber(e.target.value)}
                required
                placeholder="VP-01"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="licensePlate">Immatriculation *</Label>
              <Input
                id="licensePlate"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value)}
                required
                placeholder="AB-123-CD"
                className="font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand">Marque</Label>
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Renault" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Modèle</Label>
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Clio" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mileage">Kilométrage</Label>
            <Input
              id="mileage"
              type="number"
              min={0}
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="45000"
            />
          </div>
        </div>
      </section>

      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>État de la carrosserie</h3>
        </header>
        <div className="p-4">
          {id ? (
            <VehicleDamageEditor vehicleId={id} />
          ) : (
            // Un dégât se rattache à un véhicule par sa clé étrangère : il n'y a
            // rien à quoi le rattacher avant la création.
            <p className="text-sm text-muted-foreground">
              Le relevé des dégâts sera disponible après la création du véhicule.
            </p>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {id ? "Enregistrer" : "Créer"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/loan-vehicles">Annuler</Link>
        </Button>
      </div>
    </form>
  );
}
