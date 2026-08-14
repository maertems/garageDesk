"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, Trash2, CheckSquare, FileText } from "lucide-react";
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
import FuelGauge from "./FuelGauge";

type Client = { id: number; firstName: string | null; lastName: string };
type LoanVehicle = {
  id: number;
  uniqueNumber: string;
  licensePlate: string;
  brand?: string;
  model?: string;
  active?: boolean;
};
type Reservation = {
  id: number;
  loanVehicleId: number;
  clientId: number;
  startDate: string;
  endDate: string | null;
  startMileage: number | null;
  fuelLevelEighths: number | null;
  endMileage: number | null;
  endFuelLevelEighths: number | null;
  loanVehicleUniqueNumber?: string;
  loanVehicleLicensePlate?: string;
  loanVehicleBrand?: string;
  loanVehicleModel?: string;
  clientFirstName?: string | null;
  clientLastName?: string;
};

function toDateLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocal(): string {
  return toDateLocal(new Date().toISOString());
}

function formatLoanVehicleDisplay(r: Reservation): string {
  const model = [r.loanVehicleBrand, r.loanVehicleModel].filter(Boolean).join(" ") || "";
  const plate = r.loanVehicleLicensePlate ?? "";
  return model && plate
    ? `${model} — ${plate}`
    : (plate || model || r.loanVehicleUniqueNumber) ?? String(r.loanVehicleId);
}

function clientLabel(c: Client): string {
  return [c.lastName, c.firstName].filter(Boolean).join(" ");
}

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40 rounded-t-lg";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card";

/* ── Combobox client ───────────────────────────────────────────────── */
function ClientCombobox({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: number | "";
  onChange: (id: number | "") => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display label when value is set externally
  useEffect(() => {
    if (value === "") {
      setInputValue("");
    } else {
      const found = clients.find((c) => c.id === value);
      if (found) setInputValue(clientLabel(found));
    }
  }, [value, clients]);

  const filtered = useMemo(() => {
    const q = inputValue.toLowerCase();
    if (!q) return clients.slice(0, 40);
    return clients
      .filter((c) => clientLabel(c).toLowerCase().includes(q))
      .slice(0, 40);
  }, [clients, inputValue]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Si rien sélectionné, réaffiche le nom du client actuel
        if (value !== "") {
          const found = clients.find((c) => c.id === value);
          if (found) setInputValue(clientLabel(found));
        }
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [value, clients]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="text"
        placeholder="Rechercher un client…"
        value={inputValue}
        autoComplete="off"
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(""); // désélectionne jusqu'au choix
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${value === c.id ? "font-semibold" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.id);
                setInputValue(clientLabel(c));
                setOpen(false);
              }}
            >
              {clientLabel(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Formulaire principal ──────────────────────────────────────────── */
type LoanReservationFormProps = {
  editingId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function LoanReservationForm({
  editingId,
  onClose,
  onSaved,
}: LoanReservationFormProps) {
  const isEdit = editingId != null;
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<LoanVehicle[]>([]);
  const [activeReservations, setActiveReservations] = useState<{ id: number; loanVehicleId: number; endDate: string | null }[]>([]);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [clientId, setClientId] = useState<number | "">("");
  const [loanVehicleId, setLoanVehicleId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startMileage, setStartMileage] = useState("");
  const [fuelLevelEighths, setFuelLevelEighths] = useState<number | null>(null);
  const [endMileage, setEndMileage] = useState("");
  const [endFuelLevelEighths, setEndFuelLevelEighths] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/proxy/clients").then((r) => r.json()),
      fetch("/api/proxy/loanVehicles").then((r) => r.json()),
      fetch("/api/proxy/loanReservations").then((r) => r.json()),
    ])
      .then(([cls, veh, reservations]) => {
        setClients(Array.isArray(cls) ? cls : []);
        setVehicles(Array.isArray(veh) ? veh : []);
        setActiveReservations(Array.isArray(reservations) ? reservations : []);
      })
      .catch(() => {});
  }, [isEdit]);

  useEffect(() => {
    if (!editingId) return;
    setLoading(true);
    fetch(`/api/proxy/loanReservations/${editingId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Réservation introuvable");
        return r.json();
      })
      .then((r: Reservation) => {
        setReservation(r);
        setClientId(r.clientId);
        setLoanVehicleId(r.loanVehicleId);
        setStartDate(toDateLocal(r.startDate));
        setEndDate(r.endDate ? toDateLocal(r.endDate) : "");
        setStartMileage(r.startMileage != null ? String(r.startMileage) : "");
        setFuelLevelEighths(r.fuelLevelEighths ?? null);
        setEndMileage(r.endMileage != null ? String(r.endMileage) : "");
        setEndFuelLevelEighths(r.endFuelLevelEighths ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editingId]);

  // La réservation est "en cours" si pas de date de fin ou date de fin >= aujourd'hui
  const isOngoing = isEdit && (!endDate || endDate >= todayLocal());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!clientId || !loanVehicleId || !startDate) {
      setError("Client, véhicule et date de début sont obligatoires.");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      clientId: Number(clientId),
      loanVehicleId: Number(loanVehicleId),
      startDate: new Date(startDate + "T00:00:00").toISOString(),
    };
    if (endDate) body.endDate = new Date(endDate + "T00:00:00").toISOString();
    if (startMileage) body.startMileage = parseInt(startMileage, 10);
    if (fuelLevelEighths != null) body.fuelLevelEighths = fuelLevelEighths;
    const res = await fetch("/api/proxy/loanReservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur");
      return;
    }
    onSaved();
    onClose();
  }

  async function handlePatch(overrideEndDate?: string) {
    if (!editingId || !reservation) return;
    setError("");
    setSaving(true);
    const finalEndDate = overrideEndDate !== undefined ? overrideEndDate : endDate;
    const body: Record<string, unknown> = {
      loanVehicleId: Number(loanVehicleId),
      startDate: new Date(startDate + "T00:00:00").toISOString(),
    };
    if (finalEndDate) body.endDate = new Date(finalEndDate + "T00:00:00").toISOString();
    if (startMileage !== "") body.startMileage = parseInt(startMileage, 10);
    if (fuelLevelEighths != null) body.fuelLevelEighths = fuelLevelEighths;
    if (endMileage !== "") body.endMileage = parseInt(endMileage, 10);
    if (endFuelLevelEighths != null) body.endFuelLevelEighths = endFuelLevelEighths;
    const res = await fetch(`/api/proxy/loanReservations/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur");
      return;
    }
    onSaved();
    onClose();
  }

  async function handleTerminer() {
    const today = todayLocal();
    setEndDate(today);
    await handlePatch(today);
  }

  async function handleDelete() {
    if (!editingId || !confirm("Supprimer cette réservation ?")) return;
    setSaving(true);
    const res = await fetch(`/api/proxy/loanReservations/${editingId}`, { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur");
    }
  }

  const occupiedVehicleIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Set(
      activeReservations
        .filter((r) => {
          const isActive = r.endDate === null || r.endDate.slice(0, 10) >= today;
          const isCurrentReservation = editingId !== null && r.id === editingId;
          return isActive && !isCurrentReservation;
        })
        .map((r) => r.loanVehicleId)
    );
  }, [activeReservations, editingId]);

  // Les véhicules inactifs ne sont plus proposés, sauf celui déjà affecté à la
  // réservation en cours de modification : le retirer viderait le select.
  const selectableVehicles = useMemo(
    () => vehicles.filter((v) => v.active !== false || v.id === loanVehicleId),
    [vehicles, loanVehicleId]
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la location" : "Nouvelle location"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isEdit) handleCreate(e);
          }}
          className="px-6 py-4 space-y-5"
        >
          {loading && isEdit ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement…
            </div>
          ) : (
            <>
              <section className={SECTION_CARD}>
                <header className={SECTION_HEADER}>
                  <h3 className={SECTION_TITLE}>Client &amp; véhicule</h3>
                </header>
                <div className="p-4 space-y-3">
                  {isEdit && reservation ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Client</Label>
                      <p className="text-sm font-medium">
                        {reservation.clientFirstName} {reservation.clientLastName}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Client *</Label>
                      <ClientCombobox
                        clients={clients}
                        value={clientId}
                        onChange={setClientId}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="loanVehicleId">Véhicule de prêt *</Label>
                    <select
                      id="loanVehicleId"
                      value={loanVehicleId}
                      onChange={(e) =>
                        setLoanVehicleId(e.target.value ? Number(e.target.value) : "")
                      }
                      required
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">— Choisir un véhicule —</option>
                      {selectableVehicles.map((v) => {
                        const occupied = occupiedVehicleIds.has(v.id);
                        return (
                          <option key={v.id} value={v.id} disabled={occupied}>
                            {v.uniqueNumber} — {v.licensePlate}{" "}
                            {[v.brand, v.model].filter(Boolean).join(" ") || ""}
                            {occupied ? " (déjà prêté)" : ""}
                            {v.active === false ? " (inactif)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </section>

              <section className={SECTION_CARD}>
                <header className={SECTION_HEADER}>
                  <h3 className={SECTION_TITLE}>Période</h3>
                </header>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="startDate">Date début *</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="endDate">
                        Date fin
                        {!endDate && (
                          <span className="ml-1.5 text-xs text-amber-600 font-normal">en cours</span>
                        )}
                      </Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  {isOngoing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleTerminer}
                      disabled={saving}
                      className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <CheckSquare className="h-4 w-4 mr-1.5" />
                      Terminer maintenant (aujourd&apos;hui)
                    </Button>
                  )}
                </div>
              </section>

              <section className={SECTION_CARD}>
                <header className={SECTION_HEADER}>
                  <h3 className={SECTION_TITLE}>État au départ</h3>
                </header>
                <div className="p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="startMileage">Kilométrage</Label>
                    <Input
                      id="startMileage"
                      type="number"
                      min={0}
                      value={startMileage}
                      onChange={(e) => setStartMileage(e.target.value)}
                      placeholder="Optionnel"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Réservoir d&apos;essence</Label>
                    <FuelGauge value={fuelLevelEighths} onChange={setFuelLevelEighths} />
                  </div>
                </div>
              </section>

              {isEdit && (
                <section className={SECTION_CARD}>
                  <header className={SECTION_HEADER}>
                    <h3 className={SECTION_TITLE}>État au retour</h3>
                  </header>
                  <div className="p-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="endMileage">Kilométrage de fin</Label>
                      <Input
                        id="endMileage"
                        type="number"
                        min={0}
                        value={endMileage}
                        onChange={(e) => setEndMileage(e.target.value)}
                        placeholder="Optionnel"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Réservoir au retour</Label>
                      <FuelGauge value={endFuelLevelEighths} onChange={setEndFuelLevelEighths} />
                    </div>
                  </div>
                </section>
              )}

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </>
          )}
        </form>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
          {/* Contrat de prêt : seulement en modification, la réservation devant
              exister pour être imprimée. `mr-auto` le pousse à gauche du pied de
              modal, à l'écart d'Annuler et d'Enregistrer. */}
          {isEdit && (
            <Button asChild type="button" variant="outline" className="mr-auto">
              <a
                href={`/api/proxy/loanReservations/${editingId}/contract-pdf`}
                download={`contrat-pret-${reservation?.loanVehicleLicensePlate ?? editingId}.pdf`}
              >
                <FileText className="h-4 w-4" />
                Contrat de prêt
              </a>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          {isEdit ? (
            <Button onClick={() => handlePatch()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          ) : (
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer la location
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
