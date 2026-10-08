"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, Trash2, CheckSquare, FileText, Plus, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ClientPicker from "@/components/clients/ClientPicker";
import { useClientSearch } from "@/components/clients/useClientSearch";
import ClientFormModal from "@/app/clients/ClientFormModal";
import ClientModal from "@/app/clients/ClientModal";
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

/** « 14:30 » depuis un ISO, en heure locale. */
function toTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Choix proposés : la demi-heure, de 00:00 à 23:30. L'heure pleine seule serait
// trop grossière — un véhicule se rend à 8h30 — et le quart d'heure allongerait
// la liste sans servir ici.
const HEURES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});

/** L'heure courante, ramenée à la demi-heure inférieure : 14h37 donne 14:30. */
function heureCouranteArrondie(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${d.getMinutes() < 30 ? "00" : "30"}`;
}

// Fin par défaut : midi, choix du garage. Un prêt commencé le matin se rend le
// plus souvent en fin de matinée.
const HEURE_FIN_DEFAUT = "12:00";

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
  // Recherche serveur : la liste complète des clients n'est plus téléchargée. En
  // modification, le client s'affiche depuis la réservation, pas depuis ce champ.
  const clientSearch = useClientSearch<Client>();
  const [vehicles, setVehicles] = useState<LoanVehicle[]>([]);
  const [activeReservations, setActiveReservations] = useState<{ id: number; loanVehicleId: number; endDate: string | null }[]>([]);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [clientId, setClientId] = useState<number | "">("");
  const [loanVehicleId, setLoanVehicleId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Les colonnes sont des DATETIME depuis l'origine : l'heure était simplement
  // forcée à minuit faute de champ. Aucune migration n'a donc été nécessaire.
  const [startTime, setStartTime] = useState(heureCouranteArrondie);
  const [showClientModal, setShowClientModal] = useState(false);
  // Fiche consultée depuis le « i ». Nulle = fermée.
  const [infoClientId, setInfoClientId] = useState<number | null>(null);
  const [endTime, setEndTime] = useState(HEURE_FIN_DEFAUT);
  const [startMileage, setStartMileage] = useState("");
  const [fuelLevelEighths, setFuelLevelEighths] = useState<number | null>(null);
  const [endMileage, setEndMileage] = useState("");
  const [endFuelLevelEighths, setEndFuelLevelEighths] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/proxy/loanVehicles").then((r) => r.json()),
      fetch("/api/proxy/loanReservations").then((r) => r.json()),
    ])
      .then(([veh, reservations]) => {
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
        setStartTime(toTimeLocal(r.startDate));
        if (r.endDate) setEndTime(toTimeLocal(r.endDate));
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
      startDate: new Date(`${startDate}T${startTime}:00`).toISOString(),
    };
    if (endDate) body.endDate = new Date(`${endDate}T${endTime}:00`).toISOString();
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
      startDate: new Date(`${startDate}T${startTime}:00`).toISOString(),
    };
    if (finalEndDate) body.endDate = new Date(`${finalEndDate}T${endTime}:00`).toISOString();
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
                      <div className="flex gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <ClientPicker
                            clients={clientSearch.clients}
                            value={clientId}
                            onChange={(c) => {
                              clientSearch.setSelected(c);
                              setClientId(c?.id ?? "");
                            }}
                            label={clientLabel}
                            // Ce formulaire proposait les quarante premiers clients
                            // dès la mise au point, sans saisie. Avec une recherche
                            // serveur, il faut taper quelque chose : deux caractères,
                            // comme le nouveau document.
                            onSearch={clientSearch.search}
                            searching={clientSearch.searching}
                            minChars={2}
                            maxItems={40}
                            placeholder="Rechercher un client (min. 2 caractères)"
                            emptyLabel="Aucun client trouvé"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() => setShowClientModal(true)}
                          title="Ajouter un client"
                          aria-label="Ajouter un client"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          disabled={!clientId}
                          onClick={() => setInfoClientId(Number(clientId))}
                          title="Voir la fiche du client"
                          aria-label="Voir la fiche du client"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
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
                    <div className="space-y-1.5">
                      <Label htmlFor="startTime">Heure début</Label>
                      <select
                        id="startTime"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {HEURES.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="endTime">Heure fin</Label>
                      {/* Inerte sans date de fin : l'heure n'a alors rien à
                          qualifier, le prêt étant en cours. */}
                      <select
                        id="endTime"
                        value={endTime}
                        disabled={!endDate}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {HEURES.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
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

      {/* Création d'un client sans quitter la réservation. Le client créé est
          aussitôt choisi : c'est pour lui qu'on venait. */}
      <ClientFormModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        onSaved={(c) => {
          setShowClientModal(false);
          const id = typeof c?.id === "number" ? c.id : null;
          if (id == null) return;
          // La fiche rendue par la création suffit au champ pour afficher le nom.
          clientSearch.setSelected(c as unknown as Client);
          setClientId(id);
        }}
      />

      {/* Consultation seule : `hideEdit` retire le bouton « Modifier », qui
          navigue vers la fiche et ferait perdre la réservation en cours. */}
      <ClientModal clientId={infoClientId} onClose={() => setInfoClientId(null)} hideEdit />
    </Dialog>
  );
}
