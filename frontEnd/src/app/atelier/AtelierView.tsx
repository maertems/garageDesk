"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { addDays, startOfWeek, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, ChevronLeft, ChevronRight, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkshopCar, PlanningEntry } from "./page";

const DOC_TYPE_COLOR: Record<string, string> = {
  OR: "border-l-blue-500",
  Dev: "border-l-orange-400",
  Fact: "border-l-green-500",
};

function carLabel(car: { brand?: string | null; model?: string | null }) {
  return [car.brand, car.model].filter(Boolean).join(" ") || "Véhicule";
}

function clientLabel(entry: { clientFirstName?: string | null; clientLastName?: string | null }) {
  return [entry.clientLastName?.toUpperCase(), entry.clientFirstName]
    .filter(Boolean)
    .join(" ") || "—";
}

// ---------- Postit (colonne gauche — draggable uniquement) ----------
function CarPostit({ car }: { car: WorkshopCar }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `car-${car.vehicleId}`,
    data: { type: "car", car },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const colorClass = DOC_TYPE_COLOR[car.latestDocType ?? ""] ?? "border-l-muted-foreground/30";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border border-border border-l-4 ${colorClass} bg-card shadow-sm px-3 py-2 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <p className="text-xs font-semibold truncate text-foreground">{carLabel(car)}</p>
      <p className="text-[11px] text-muted-foreground truncate">{car.licensePlate ?? "—"}</p>
      <p className="text-[11px] text-muted-foreground truncate">{clientLabel(car)}</p>
    </div>
  );
}

// ---------- Postit dans colonne jour (avec poubelle) ----------
function PlanPostit({
  entry,
  onDeleteRequest,
}: {
  entry: PlanningEntry;
  onDeleteRequest: (entry: PlanningEntry) => void;
}) {
  const linked = Boolean(entry.appointmentId);
  const colorClass = linked ? "border-l-amber-500" : "border-l-primary/60";
  return (
    <div
      className={`rounded-md border border-border border-l-4 ${colorClass} bg-card shadow-sm px-3 py-2 flex items-start gap-1`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {linked && (
            <span title="Lié à un RDV"><CalendarClock className="h-3 w-3 shrink-0 text-amber-500" /></span>
          )}
          <p className="text-xs font-semibold truncate text-foreground">{carLabel(entry)}</p>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{entry.licensePlate ?? "—"}</p>
        <p className="text-[11px] text-muted-foreground truncate">{clientLabel(entry)}</p>
      </div>
      <button
        onClick={() => onDeleteRequest(entry)}
        className="shrink-0 mt-0.5 text-muted-foreground hover:text-destructive transition-colors"
        title="Retirer du planning"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------- Colonne jour (droppable) ----------
function DayColumn({
  date,
  entries,
  onDeleteRequest,
  isOver,
}: {
  date: Date;
  entries: PlanningEntry[];
  onDeleteRequest: (entry: PlanningEntry) => void;
  isOver: boolean;
}) {
  const dateISO = format(date, "yyyy-MM-dd");
  const { setNodeRef } = useDroppable({ id: dateISO });

  return (
    <div className="flex flex-col min-w-0">
      <div className="px-2 py-1.5 border-b bg-secondary/30 text-center">
        <p className="text-xs font-semibold capitalize text-foreground">
          {format(date, "EEE", { locale: fr })}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(date, "d MMM", { locale: fr })}
        </p>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors rounded-b-md ${
          isOver ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
        }`}
      >
        {entries.map((e) => (
          <PlanPostit key={e.id} entry={e} onDeleteRequest={onDeleteRequest} />
        ))}
      </div>
    </div>
  );
}

// ---------- Composant principal ----------
export default function AtelierView({
  initialCars,
  initialPlanning,
  initialWeekStart,
}: {
  initialCars: WorkshopCar[];
  initialPlanning: PlanningEntry[];
  initialWeekStart: string;
}) {
  const [baseDate, setBaseDate] = useState(() => parseISO(initialWeekStart));
  const [cars, setCars] = useState<WorkshopCar[]>(initialCars);
  const [planning, setPlanning] = useState<PlanningEntry[]>(initialPlanning);
  const [activeCar, setActiveCar] = useState<WorkshopCar | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<PlanningEntry | null>(null);
  const [carSearch, setCarSearch] = useState("");

  const filteredCars = useMemo(() => {
    if (!carSearch.trim()) return cars;
    const q = carSearch.toLowerCase();
    return cars.filter((c) =>
      [c.clientFirstName, c.clientLastName, c.licensePlate, c.brand, c.model, c.type]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [cars, carSearch]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const weekLabel = (() => {
    const start = format(weekStart, "d MMM", { locale: fr });
    const end = format(addDays(weekStart, 4), "d MMM yyyy", { locale: fr });
    return `${start} – ${end}`;
  })();

  const loadWeek = useCallback(async (monday: Date) => {
    const ws = format(monday, "yyyy-MM-dd");
    const [planRes, carsRes] = await Promise.allSettled([
      fetch(`/api/proxy/workshopPlanning?weekStart=${ws}`),
      fetch("/api/proxy/workshopCarsAvailable"),
    ]);
    if (planRes.status === "fulfilled" && planRes.value.ok)
      setPlanning(await planRes.value.json());
    if (carsRes.status === "fulfilled" && carsRes.value.ok)
      setCars(await carsRes.value.json());
  }, []);

  const prevWeek = () => {
    const d = addDays(weekStart, -7);
    setBaseDate(d);
    loadWeek(d);
  };

  const nextWeek = () => {
    const d = addDays(weekStart, 7);
    setBaseDate(d);
    loadWeek(d);
  };

  const goToday = () => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 });
    setBaseDate(d);
    loadWeek(d);
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "car") {
      setActiveCar(event.active.data.current.car as WorkshopCar);
    }
  };

  const handleDragOver = (event: { over: { id: string | number } | null }) => {
    setOverDay(event.over ? String(event.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCar(null);
    setOverDay(null);
    const { over, active } = event;
    if (!over) return;
    const car = active.data.current?.car as WorkshopCar | undefined;
    if (!car) return;
    const planDate = String(over.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) return;

    try {
      const res = await fetch("/api/proxy/workshopPlanning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: car.vehicleId, planDate }),
      });
      if (res.ok) {
        const entry: PlanningEntry = await res.json();
        setPlanning((prev) => [...prev, entry]);
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/proxy/workshopPlanning/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setPlanning((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {}
  };

  const handleDeleteRequest = (entry: PlanningEntry) => {
    if (entry.appointmentId) {
      setConfirmDeleteEntry(entry);
    } else {
      handleDelete(entry.id);
    }
  };

  const entriesForDay = (dateISO: string) =>
    planning.filter((e) => e.planDate === dateISO);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-screen overflow-hidden">
      {/* Toolbar — même structure que CalendarView */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={prevWeek} aria-label="Précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" onClick={nextWeek} aria-label="Suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 ml-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <span className="text-base font-semibold tracking-tight first-letter:capitalize">
            {`Semaine du ${format(days[0], "d MMMM y", { locale: fr })}`}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        <div className="flex gap-3 h-full overflow-hidden">
          {/* Colonne gauche — voitures disponibles */}
          <div className="w-52 shrink-0 flex flex-col border rounded-lg overflow-hidden bg-card">
            <div className="px-3 py-2 border-b bg-secondary/30 space-y-1.5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  En attente
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {carSearch.trim() ? `${filteredCars.length}/${cars.length}` : `${cars.length}`}
                </p>
              </div>
              <input
                type="text"
                value={carSearch}
                onChange={(e) => setCarSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full text-xs rounded border border-border bg-background px-2 py-1 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
              {filteredCars.map((car) => (
                <CarPostit key={car.vehicleId} car={car} />
              ))}
            </div>
          </div>

          {/* Colonnes jours */}
          <div className="flex-1 grid grid-cols-5 gap-2 overflow-hidden">
            {days.map((day) => {
              const dateISO = format(day, "yyyy-MM-dd");
              return (
                <div key={dateISO} className="flex flex-col border rounded-lg overflow-hidden bg-card overflow-y-auto scrollbar-thin">
                  <DayColumn
                    date={day}
                    entries={entriesForDay(dateISO)}
                    onDeleteRequest={handleDeleteRequest}
                    isOver={overDay === dateISO}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* Confirmation suppression entrée liée à un RDV */}
      <Dialog
        open={confirmDeleteEntry !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteEntry(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Retirer du planning atelier ?</DialogTitle>
            <DialogDescription>
              {confirmDeleteEntry && (
                <>
                  Ce véhicule est lié à un RDV{" "}
                  {confirmDeleteEntry.appointmentStartTime
                    ? `du ${format(parseISO(confirmDeleteEntry.planDate), "EEEE d MMMM", { locale: fr })} à ${format(parseISO(confirmDeleteEntry.appointmentStartTime), "HH:mm")}`
                    : `du ${format(parseISO(confirmDeleteEntry.planDate), "EEEE d MMMM", { locale: fr })}`}
                  . Supprimer quand même ?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteEntry(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteEntry) {
                  handleDelete(confirmDeleteEntry.id);
                  setConfirmDeleteEntry(null);
                }
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overlay drag */}
      <DragOverlay>
        {activeCar && (
          <div className="rounded-md border border-border border-l-4 border-l-primary bg-card shadow-lg px-3 py-2 w-48 opacity-95 rotate-1">
            <p className="text-xs font-semibold truncate">{carLabel(activeCar)}</p>
            <p className="text-[11px] text-muted-foreground truncate">{activeCar.licensePlate ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{clientLabel(activeCar)}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
