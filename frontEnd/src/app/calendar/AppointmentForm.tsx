"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { format, addMinutes, parseISO, differenceInMinutes } from "date-fns";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { getLabel, appointmentCategoryLabels, appointmentStatusLabels } from "@/lib/labels";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ClientForm from "@/app/clients/ClientForm";

type Client = {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  vehicles?: { id: number; licensePlate: string; brand?: string; model?: string }[];
};
type Category = { id: number; code: string; color: string };
type Status = { id: number; code: string; color: string };
type LoanVehicle = {
  id: number;
  uniqueNumber: string;
  licensePlate: string;
  brand?: string;
  model?: string;
};

const APPOINTMENT_TYPES = ["client", "note"] as const;
const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  client: "Client",
  note: "Note",
};

const CLIENT_SUB_TYPES = ["reception", "visite", "restitution"] as const;
type ClientSubType = (typeof CLIENT_SUB_TYPES)[number];
const CLIENT_SUB_TYPE_LABELS: Record<ClientSubType, string> = {
  reception: "Réception",
  visite: "Visite",
  restitution: "Restitution",
};

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 120, label: "2 h" },
  { value: 240, label: "4 h" },
  { value: 480, label: "8 h" },
];

const ALLOWED_DURATIONS = DURATION_OPTIONS.map((o) => o.value);
const MIN_CLIENT_SEARCH_CHARS = 3;

type AppointmentFormProps = {
  editingId: number | null;
  initialStart?: Date;
  initialEnd?: Date;
  categories: Category[];
  statuses: Status[];
  defaultDurationMins?: number;
  onClose: () => void;
  onSaved: () => void;
};

function getDefaultCategoryId(categories: Category[]): number | "" {
  if (!categories.length) return "";
  const mechanic = categories.find((c) => c.code === "mechanic");
  return (mechanic ?? categories[0]).id;
}

export default function AppointmentForm({
  editingId,
  initialStart,
  initialEnd,
  categories,
  statuses,
  defaultDurationMins = 15,
  onClose,
  onSaved,
}: AppointmentFormProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">(getDefaultCategoryId(categories));
  const [statusId, setStatusId] = useState<number | "">(statuses[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMins, setDurationMins] = useState(defaultDurationMins);
  const [prestation, setPrestation] = useState("");
  const [appointmentType, setAppointmentType] = useState<"client" | "note">("client");
  const [clientSubType, setClientSubType] = useState<ClientSubType>("reception");
  const [loanVehicles, setLoanVehicles] = useState<LoanVehicle[]>([]);
  const [loanReservations, setLoanReservations] = useState<{ loanVehicleId: number; endDate: string | null; appointmentId: number | null }[]>([]);
  const [loanVehicleId, setLoanVehicleId] = useState<number | "">("");
  const [loanStartDate, setLoanStartDate] = useState("");
  const [loanEndDate, setLoanEndDate] = useState("");
  const [comment, setComment] = useState("");
  const [smsReminder, setSmsReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notificationWarnings, setNotificationWarnings] = useState<string[] | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientInputRef = useRef<HTMLInputElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  const endDateTime = useMemo(() => {
    if (!startDate || !startTime) return null;
    const start = new Date(`${startDate}T${startTime}`);
    if (isNaN(start.getTime())) return null;
    return addMinutes(start, durationMins);
  }, [startDate, startTime, durationMins]);

  const endDateStr = endDateTime ? format(endDateTime, "yyyy-MM-dd") : "";
  const endTimeStr = endDateTime ? format(endDateTime, "HH:mm") : "";

  useEffect(() => {
    if (initialStart) {
      setStartDate(format(initialStart, "yyyy-MM-dd"));
      setStartTime(format(initialStart, "HH:mm"));
    }
    if (initialEnd && initialStart) {
      const mins = differenceInMinutes(initialEnd, initialStart);
      const match =
        DURATION_OPTIONS.find((o) => o.value === mins) ??
        DURATION_OPTIONS.find((o) => o.value >= mins);
      setDurationMins(match?.value ?? DURATION_OPTIONS[0].value);
    } else if (!editingId) {
      fetch("/api/proxy/settings")
        .then((r) => r.json())
        .then((settings: { key: string; value: string }[]) => {
          const map: Record<string, string> = {};
          if (Array.isArray(settings)) settings.forEach((s) => (map[s.key] = s.value));
          const raw = map.calendarDefaultDurationMinutes || "15";
          const parsed = parseInt(raw, 10);
          const mins = ALLOWED_DURATIONS.includes(parsed) ? parsed : 15;
          setDurationMins(mins);
        })
        .catch(() => setDurationMins(defaultDurationMins));
    }
  }, [initialStart, initialEnd, editingId, defaultDurationMins]);

  useEffect(() => {
    if (categories.length && !categoryId) setCategoryId(getDefaultCategoryId(categories));
  }, [categories, categoryId]);

  useEffect(() => {
    if (!editingId) return;
    fetch(`/api/proxy/appointments/${editingId}`)
      .then((r) => r.json())
      .then((apt) => {
        setClientId(apt.clientId ?? "");
        setVehicleId(apt.vehicleId ?? "");
        setCategoryId(apt.categoryId ?? "");
        setStatusId(apt.statusId ?? "");
        setPrestation(apt.prestation || "");
        const type: "client" | "note" = apt.appointmentType === "note" ? "note" : "client";
        setAppointmentType(type);
        if (type === "client" && CLIENT_SUB_TYPES.includes(apt.appointmentSubType)) {
          setClientSubType(apt.appointmentSubType as ClientSubType);
        }
        setLoanVehicleId(apt.loanVehicleId ?? "");
        setLoanStartDate(apt.loanStartDate ? format(parseISO(apt.loanStartDate), "yyyy-MM-dd") : "");
        setLoanEndDate(apt.loanEndDate ? format(parseISO(apt.loanEndDate), "yyyy-MM-dd") : "");
        const start = parseISO(apt.startTime);
        const end = parseISO(apt.endTime);
        setStartDate(format(start, "yyyy-MM-dd"));
        setStartTime(format(start, "HH:mm"));
        const mins = differenceInMinutes(end, start);
        const match =
          DURATION_OPTIONS.find((o) => o.value === mins) ??
          DURATION_OPTIONS.find((o) => o.value >= mins);
        setDurationMins(match?.value ?? DURATION_OPTIONS[DURATION_OPTIONS.length - 1].value);
        setComment(apt.comment || "");
        setSmsReminder(apt.smsReminder ?? true);
      })
      .catch(() => {});
  }, [editingId]);

  useEffect(() => {
    Promise.all([
      fetch("/api/proxy/loanVehicles").then((r) => r.json()),
      fetch("/api/proxy/loanReservations").then((r) => r.json()),
    ])
      .then(([vehicles, reservations]) => {
        setLoanVehicles(Array.isArray(vehicles) ? vehicles : []);
        setLoanReservations(Array.isArray(reservations) ? reservations : []);
      })
      .catch(() => {});
  }, []);

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (term.length < MIN_CLIENT_SEARCH_CHARS) return [];
    const base = clients.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(term) ||
        `${c.lastName} ${c.firstName}`.toLowerCase().includes(term)
    );
    const slice = base.slice(0, 20);
    if (editingId && clientId && !slice.some((c) => c.id === clientId)) {
      const selected = clients.find((c) => c.id === clientId);
      if (selected) return [selected, ...slice.filter((c) => c.id !== selected.id)].slice(0, 20);
    }
    return slice;
  }, [clients, clientSearch, editingId, clientId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/proxy/clients?withVehicles=true")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setClients(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setClients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);
  const vehicles = selectedClient?.vehicles ?? [];

  useEffect(() => {
    if (!vehicles.length) {
      if (!editingId) setVehicleId("");
      return;
    }
    if (editingId) return;
    const vid =
      vehicleId === "" || vehicleId === null || vehicleId === undefined ? null : Number(vehicleId);
    const currentVehicleInList = vid != null && vehicles.some((v) => Number(v.id) === vid);
    if (currentVehicleInList) return;
    setVehicleId(vehicles[0].id);
  }, [editingId, selectedClient, vehicles, vehicleId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(e.target as Node) &&
        clientInputRef.current &&
        !clientInputRef.current.contains(e.target as Node)
      ) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleClientCreated(newClient: Record<string, unknown>) {
    setShowClientModal(false);
    const id = typeof newClient?.id === "number" ? newClient.id : null;
    if (id == null) return;
    fetch("/api/proxy/clients?withVehicles=true")
      .then((r) => r.json())
      .then((data) => {
        setClients(Array.isArray(data) ? data : []);
        setClientId(id);
        setClientSearch("");
        setClientDropdownOpen(false);
      })
      .catch(() => {});
  }

  async function doSubmit() {
    const isNote = appointmentType === "note";
    const body: Record<string, unknown> = {
      clientId: isNote ? null : Number(clientId),
      vehicleId: isNote ? null : Number(vehicleId),
      categoryId: isNote ? null : Number(categoryId),
      statusId: isNote ? null : Number(statusId),
      prestation: prestation.trim() || null,
      appointmentType,
      appointmentSubType: appointmentType === "client" ? clientSubType : null,
      loanVehicleId:
        loanVehicleId !== "" && appointmentType !== "note" ? Number(loanVehicleId) : null,
      loanStartDate:
        loanVehicleId !== "" && appointmentType !== "note" ? loanStartDate : null,
      loanEndDate: loanVehicleId !== "" && appointmentType !== "note" ? (loanEndDate || null) : null,
      startTime: new Date(`${startDate}T${startTime}`).toISOString(),
      endTime: endDateTime!.toISOString(),
      comment: comment || null,
      smsReminder,
    };
    const isEdit = editingId != null;
    const url = isEdit ? `/api/proxy/appointments/${editingId}` : "/api/proxy/appointments";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const message = data.detail?.message ?? data.message ?? "Erreur lors de l'enregistrement";
      setError(message);
      return;
    }
    onSaved();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotificationWarnings(null);
    const isNote = appointmentType === "note";
    if (!isNote && (!clientId || !vehicleId)) {
      setError("Veuillez sélectionner un client et un véhicule.");
      return;
    }
    if (!startDate || !startTime || !endDateTime) {
      setError("Veuillez remplir la date et l'heure.");
      return;
    }
    if (!isNote && (!categoryId || !statusId)) {
      setError("Veuillez sélectionner une catégorie et un statut.");
      return;
    }
    const hasLoan = loanVehicleId !== "" && appointmentType !== "note";
    if (hasLoan && !loanStartDate) {
      setError("Veuillez renseigner la date de début du prêt.");
      return;
    }
    setSaving(true);

    if (!editingId && appointmentType === "client" && clientId && selectedClient) {
      try {
        const [settingsRes, endpointsRes] = await Promise.all([
          fetch("/api/proxy/notifications/settings", { credentials: "include" }),
          fetch("/api/proxy/notifications/endpoints", { credentials: "include" }),
        ]);
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        const endpoints = endpointsRes.ok ? await endpointsRes.json() : [];
        const activeEndpoints = Array.isArray(endpoints)
          ? endpoints.filter((ep: { active?: boolean }) => ep.active !== false)
          : [];
        const notificationsOn = settings?.notificationOnCreate === true;
        if (notificationsOn && activeEndpoints.length > 0) {
          const warnings: string[] = [];
          const hasEmail = (selectedClient.email ?? "").trim().length > 0;
          const hasPhone = (selectedClient.phone ?? "").trim().length > 0;
          for (const ep of activeEndpoints) {
            if (ep.type === "email" && !hasEmail)
              warnings.push("L'email ne sera pas envoyé : le client n'a pas d'adresse email.");
            if (ep.type === "sms" && !hasPhone)
              warnings.push("Le SMS ne sera pas envoyé : le client n'a pas de numéro de téléphone.");
          }
          if (warnings.length > 0) {
            setSaving(false);
            setNotificationWarnings(warnings);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    await doSubmit();
  }

  async function handleDelete() {
    if (!editingId) return;
    if (!confirm("Supprimer ce rendez-vous ?")) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/proxy/appointments/${editingId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.detail?.message ?? data.message ?? "Erreur lors de la suppression");
      return;
    }
    onSaved();
  }

  const clientDisplayValue = selectedClient
    ? `${selectedClient.lastName} ${selectedClient.firstName}`
    : clientSearch;

  const sortedCategories = [...categories].sort((a, b) =>
    a.code === "mechanic" ? -1 : b.code === "mechanic" ? 1 : 0
  );

  const occupiedLoanVehicleIds = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return new Set(
      loanReservations
        .filter((r) => {
          const isActive = r.endDate === null || r.endDate.slice(0, 10) >= today;
          const isCurrentAppt = editingId !== null && r.appointmentId === editingId;
          return isActive && !isCurrentAppt;
        })
        .map((r) => r.loanVehicleId)
    );
  }, [loanReservations, editingId]);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-5 overflow-y-auto flex-1 min-h-0">
            {/* Type tabs + sous-type client */}
            <div className="flex items-center justify-center gap-10 flex-wrap">
              <div className="inline-flex p-1 rounded-lg bg-secondary">
                {APPOINTMENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAppointmentType(t)}
                    className={cn(
                      "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                      appointmentType === t
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {APPOINTMENT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              {appointmentType === "client" && (
                <div className="inline-flex p-1 rounded-lg bg-secondary">
                  {CLIENT_SUB_TYPES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setClientSubType(s)}
                      className={cn(
                        "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                        clientSubType === s
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {CLIENT_SUB_TYPE_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {appointmentType !== "note" && (
              <section className="rounded-lg border bg-card">
                <header className="px-4 py-2 border-b bg-secondary/40 rounded-t-lg">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Client &amp; véhicule
                  </h3>
                </header>
                <div className="p-4 space-y-3">
                  <div className="flex gap-2 min-w-0">
                    <div className="relative flex-1 min-w-0" ref={clientDropdownRef}>
                      <Input
                        ref={clientInputRef}
                        type="text"
                        value={clientDisplayValue}
                        className="truncate"
                        onChange={(e) => {
                          setClientSearch(e.target.value);
                          setClientId("");
                          setClientDropdownOpen(
                            e.target.value.trim().length >= MIN_CLIENT_SEARCH_CHARS
                          );
                        }}
                        onFocus={() => {
                          if (clientSearch.trim().length >= MIN_CLIENT_SEARCH_CHARS)
                            setClientDropdownOpen(true);
                        }}
                        placeholder="Rechercher un client (min. 3 caractères)..."
                        autoComplete="off"
                      />
                      {clientDropdownOpen &&
                        clientSearch.trim().length >= MIN_CLIENT_SEARCH_CHARS && (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md z-50 scrollbar-thin">
                            {filteredClients.length === 0 ? (
                              <div className="px-3 py-2.5 text-sm text-muted-foreground">
                                Aucun client trouvé
                              </div>
                            ) : (
                              filteredClients.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                                  onClick={() => {
                                    setClientId(c.id);
                                    setClientSearch("");
                                    setClientDropdownOpen(false);
                                    if (c.vehicles?.length) setVehicleId(c.vehicles[0].id);
                                    else setVehicleId("");
                                  }}
                                >
                                  {c.lastName} {c.firstName}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowClientModal(true)}
                      title="Ajouter un client"
                      aria-label="Ajouter un client"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 min-w-0">
                    <Label className="text-sm shrink-0">Véhicule</Label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : "")}
                      disabled={!selectedClient}
                      className="flex h-9 flex-1 min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 truncate"
                    >
                      <option value="">— Choisir un véhicule —</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {[v.brand, v.model].filter(Boolean).join(" ")
                            ? `${[v.brand, v.model].filter(Boolean).join(" ")} - ${v.licensePlate}`
                            : v.licensePlate}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            )}

            {appointmentType !== "note" && (
              <section className="rounded-lg border bg-card overflow-hidden">
                <header className="px-4 py-2 border-b bg-secondary/40">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Opération
                  </h3>
                </header>
                <div className="p-4 space-y-3">
                  <div>
                    <Label htmlFor="prestation" className="mb-1.5 block">
                      Prestation
                    </Label>
                    <Input
                      id="prestation"
                      type="text"
                      maxLength={255}
                      value={prestation}
                      onChange={(e) => setPrestation(e.target.value)}
                      placeholder="Affichée dans le bloc calendrier"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      {sortedCategories.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <input
                            type="radio"
                            name="category"
                            checked={categoryId === c.id}
                            onChange={() => setCategoryId(c.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span
                            className="inline-block h-3 w-3 rounded-sm"
                            style={{ background: c.color }}
                          />
                          {getLabel(appointmentCategoryLabels, c.code)}
                        </label>
                      ))}
                    </div>
                    <div>
                      <Label className="mb-1.5 block">Statut</Label>
                      <select
                        value={statusId}
                        onChange={(e) => setStatusId(Number(e.target.value))}
                        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {statuses.map((s) => (
                          <option key={s.id} value={s.id}>
                            {getLabel(appointmentStatusLabels, s.code)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-lg border bg-card overflow-hidden">
              <header className="px-4 py-2 border-b bg-secondary/40">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Date et heure
                </h3>
              </header>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs">Date début *</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Date fin</Label>
                    <Input
                      type="date"
                      value={endDateStr}
                      readOnly
                      tabIndex={-1}
                      className="bg-secondary cursor-default"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs">Heure début *</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Durée</Label>
                    <select
                      value={durationMins}
                      onChange={(e) => setDurationMins(Number(e.target.value))}
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {DURATION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {endTimeStr && (
                  <p className="text-xs text-muted-foreground">
                    Fin : {endDateStr} à {endTimeStr}
                  </p>
                )}
              </div>
            </section>

            {appointmentType !== "note" && (
              <section className="rounded-lg border bg-card overflow-hidden">
                <header className="px-4 py-2 border-b bg-secondary/40">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Véhicule de prêt
                  </h3>
                </header>
                <div className="p-4 space-y-3">
                  <select
                    value={loanVehicleId}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) : "";
                      setLoanVehicleId(v);
                      if (!v) {
                        setLoanStartDate("");
                        setLoanEndDate("");
                      } else if (startDate) {
                        setLoanStartDate(startDate);
                        setLoanEndDate("");
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Pas de prêt</option>
                    {loanVehicles.map((lv) => {
                      const occupied = occupiedLoanVehicleIds.has(lv.id);
                      return (
                        <option key={lv.id} value={lv.id} disabled={occupied}>
                          {lv.uniqueNumber} — {lv.licensePlate}{" "}
                          {[lv.brand, lv.model].filter(Boolean).join(" ") || ""}
                          {occupied ? " (déjà prêté)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {loanVehicleId !== "" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1.5 block text-xs">Début prêt</Label>
                        <Input
                          type="date"
                          value={loanStartDate}
                          onChange={(e) => setLoanStartDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Label className="text-xs">Fin prêt</Label>
                          {!loanEndDate && (
                            <span className="text-xs font-medium text-amber-600">en cours</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Input
                            type="date"
                            value={loanEndDate}
                            onChange={(e) => setLoanEndDate(e.target.value)}
                            className="flex-1"
                          />
                          {loanEndDate && (
                            <button
                              type="button"
                              onClick={() => setLoanEndDate("")}
                              className="px-2 rounded-md border border-input bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-sm"
                              title="Effacer la date de fin"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-lg border bg-card overflow-hidden">
              <header className="px-4 py-2 border-b bg-secondary/40">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Commentaire {appointmentType === "client" && "& notification"}
                </h3>
              </header>
              <div className="p-4 space-y-3">
                <Textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Commentaire interne..."
                />
                {appointmentType === "client" && (
                  <div className="flex items-center justify-between rounded-md border bg-secondary/30 px-3 py-2">
                    <span className="text-sm font-medium">Notification du client</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={smsReminder}
                      onClick={() => setSmsReminder(!smsReminder)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        smsReminder ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          smsReminder ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                )}
              </div>
            </section>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </form>

          <DialogFooter className="gap-2">
            {editingId && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="mr-auto"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification warnings dialog */}
      {notificationWarnings && notificationWarnings.length > 0 && (
        <Dialog open onOpenChange={(o) => !o && setNotificationWarnings(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Notification(s) non envoyée(s)</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-4 space-y-3">
              <ul className="list-disc pl-5 text-sm space-y-1">
                {notificationWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Souhaitez-vous quand même enregistrer le rendez-vous ?
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotificationWarnings(null)}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  setNotificationWarnings(null);
                  setSaving(true);
                  doSubmit();
                }}
              >
                Enregistrer quand même
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showClientModal && (
        <Dialog open onOpenChange={(o) => !o && setShowClientModal(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nouveau client</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-4">
              <ClientForm
                onSaved={handleClientCreated}
                onClose={() => setShowClientModal(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
