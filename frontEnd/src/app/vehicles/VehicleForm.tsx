"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import ClientPicker from "@/components/clients/ClientPicker";

type VehicleRecord = Record<string, unknown>;

type Props = {
  initial?: VehicleRecord | null;
  onSaved?: (vehicle: VehicleRecord) => void;
  onClose?: () => void;
  /** Pre-selects the owner when creating a vehicle from another flow (e.g. a billing document). Ignored in edit mode. */
  defaultClientId?: number;
};

type Client = { id: number; firstName: string | null; lastName: string };

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40 rounded-t-lg";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card";

function clientLabel(c: Client) {
  return [c.lastName?.toUpperCase(), c.firstName].filter(Boolean).join(" ");
}

function formatLicensePlate(raw: string): string {
  const s = raw.toUpperCase().replace(/[\s-]/g, "");
  // Nouveau format : AA-123-BB
  const newFmt = s.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  if (newFmt) return `${newFmt[1]}-${newFmt[2]}-${newFmt[3]}`;
  // Ancien format FNI : 1234 AB 12 (espaces en base)
  const oldFmt = s.match(/^(\d{2,4})([A-Z]{2,3})(\d{2})$/);
  if (oldFmt) return `${oldFmt[1]} ${oldFmt[2]} ${oldFmt[3]}`;
  // Format non reconnu — retourne en majuscules sans modifier
  return s || raw.toUpperCase();
}


/* ── Formulaire principal ────────────────────────────────────────────── */
export default function VehicleForm({ initial, onSaved, onClose, defaultClientId }: Props) {
  const router = useRouter();
  const isModalMode = onSaved != null && onClose != null;
  const id = initial?.id as number | undefined;
  const isNew = !id;

  const [clientId, setClientId] = useState<number | "">((initial?.clientId as number) || defaultClientId || "");
  const [licensePlate, setLicensePlate] = useState((initial?.licensePlate as string) ?? "");
  const [brand, setBrand] = useState((initial?.brand as string) ?? "");
  const [model, setModel] = useState((initial?.model as string) ?? "");
  const [type, setType] = useState((initial?.type as string) ?? "");
  const [registrationDate, setRegistrationDate] = useState((initial?.registrationDate as string) ?? "");
  const [vin, setVin] = useState((initial?.vin as string) ?? "");
  const [mileage, setMileage] = useState(initial?.mileage != null ? String(initial.mileage) : "");

  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    fetch("/api/proxy/clients")
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Champs verouillés jusqu'à Vérifier ou Ignorer (création uniquement)
  const [unlocked, setUnlocked] = useState(!isNew);
  const [verifying, setVerifying] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<"none" | "found" | "notfound" | "error">("none");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify() {
    if (!licensePlate.trim()) return;
    setVerifying(true);
    setLookupStatus("none");
    try {
      const res = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(licensePlate.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setBrand(data.brand ?? "");
        setModel(data.model ?? "");
        setType(data.type ?? "");
        setRegistrationDate(data.registrationDate ?? "");
        setVin(data.vin ?? "");
        setUnlocked(true);
        setLookupStatus("found");
      } else {
        setUnlocked(true);
        setLookupStatus("notfound");
      }
    } catch {
      setUnlocked(true);
      setLookupStatus("error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Veuillez sélectionner un client."); return; }
    setError("");
    setSaving(true);
    const body = {
      clientId: Number(clientId),
      licensePlate: formatLicensePlate(licensePlate),
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      type: type.trim() || undefined,
      registrationDate: registrationDate || undefined,
      vin: vin.trim() || undefined,
      mileage: mileage ? Number(mileage) : undefined,
    };
    const url = id ? `/api/proxy/vehicles/${id}` : "/api/proxy/vehicles";
    const method = id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message || d.message || "Erreur");
      return;
    }
    const data = await res.json();
    if (isModalMode && onSaved) { onSaved(data); return; }
    router.push("/vehicles");
    router.refresh();
  }

  const lockedCls = "bg-muted text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

      {/* Propriétaire */}
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Propriétaire</h3>
        </header>
        <div className="p-4">
          <div className="space-y-1.5">
            <ClientPicker
              clients={clients}
              value={clientId}
              onChange={(c) => setClientId(c?.id ?? "")}
              label={clientLabel}
              minChars={3}
              maxItems={40}
              withIcon
              disabled={!!id}
            />
            {id && (
              <p className="text-xs text-muted-foreground">Le client ne peut pas être modifié après création.</p>
            )}
          </div>
        </div>
      </section>

      {/* Identification */}
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Identification</h3>
        </header>
        <div className="p-4 space-y-3">

          {/* Immatriculation + boutons */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                id="licensePlate"
                value={licensePlate}
                onChange={(e) => {
                  setLicensePlate(e.target.value.toUpperCase());
                  if (unlocked && isNew) { setUnlocked(false); setLookupStatus("none"); }
                }}
                onBlur={(e) => setLicensePlate(formatLicensePlate(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleVerify(); } }}
                className="font-mono flex-1"
                required
                placeholder="Immatriculation *"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={verifying || !licensePlate.trim()}
                onClick={handleVerify}
                className="shrink-0"
              >
                {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vérifier"}
              </Button>
              {isNew && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setUnlocked(true); setLookupStatus("none"); }}
                  className="shrink-0"
                >
                  Ignorer
                </Button>
              )}
            </div>
            {/* Espace toujours réservé pour éviter le saut de layout */}
            <p className="h-4 flex items-center gap-1.5 text-xs">
              {lookupStatus === "found" && <span className="flex items-center gap-1.5 text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />Véhicule identifié — champs pré-remplis.</span>}
              {lookupStatus === "notfound" && <span className="flex items-center gap-1.5 text-amber-600"><XCircle className="h-3.5 w-3.5" />Plaque inconnue — remplissez manuellement.</span>}
              {lookupStatus === "error" && <span className="flex items-center gap-1.5 text-destructive"><XCircle className="h-3.5 w-3.5" />Erreur de recherche — remplissez manuellement.</span>}
            </p>
          </div>

          {/* Marque + Modèle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand" className={!unlocked ? "text-muted-foreground" : ""}>Marque</Label>
              <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)}
                disabled={!unlocked} className={!unlocked ? lockedCls : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model" className={!unlocked ? "text-muted-foreground" : ""}>Modèle</Label>
              <Input id="model" value={model} onChange={(e) => setModel(e.target.value)}
                disabled={!unlocked} className={!unlocked ? lockedCls : ""} />
            </div>
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="type" className={!unlocked ? "text-muted-foreground" : ""}>Type / Finition</Label>
            <Input id="type" value={type} onChange={(e) => setType(e.target.value)}
              disabled={!unlocked} className={!unlocked ? lockedCls : ""} />
          </div>

          {/* Date MEC + Km */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="registrationDate" className={!unlocked ? "text-muted-foreground" : ""}>
                1ère mise en circulation
              </Label>
              <Input id="registrationDate" type="date" value={registrationDate}
                onChange={(e) => setRegistrationDate(e.target.value)}
                disabled={!unlocked} className={!unlocked ? lockedCls : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mileage" className={!unlocked ? "text-muted-foreground" : ""}>Kilométrage</Label>
              <Input id="mileage" type="number" min={0} value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                disabled={!unlocked} className={!unlocked ? lockedCls : ""} />
            </div>
          </div>

          {/* VIN */}
          <div className="space-y-1.5">
            <Label htmlFor="vin" className={!unlocked ? "text-muted-foreground" : ""}>VIN</Label>
            <Input id="vin" value={vin} onChange={(e) => setVin(e.target.value)}
              disabled={!unlocked} className={`font-mono ${!unlocked ? lockedCls : ""}`} />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {isModalMode ? (
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || (!unlocked && isNew)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {id ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={saving || (!unlocked && isNew)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {id ? "Enregistrer" : "Créer"}
          </Button>
          <Button asChild variant="outline"><Link href="/vehicles">Annuler</Link></Button>
        </div>
      )}
    </form>
  );
}
