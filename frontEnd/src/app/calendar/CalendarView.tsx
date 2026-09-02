"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  parseISO,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
  isSameDay,
  isToday,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import AppointmentForm from "./AppointmentForm";
import LoanReservationForm from "@/app/loan-vehicles/LoanReservationForm";
import {
  AppointmentTooltipBody,
  LoanTooltipBody,
  TOOLTIP_CLASS,
  formatLoanVehicleDisplay,
} from "./CalendarTooltips";
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

type Appointment = {
  id: number;
  clientId?: number | null;
  vehicleId?: number | null;
  categoryId?: number | null;
  statusId?: number | null;
  startTime: string;
  endTime: string;
  prestation?: string | null;
  appointmentType?: string;
  comment?: string;
  smsReminder: boolean;
  clientFirstName?: string;
  clientLastName?: string;
  vehicleLicensePlate?: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
  categoryCode?: string;
  statusCode?: string;
  categoryColor?: string;
  statusColor?: string;
  loanVehicleUniqueNumber?: string | null;
  loanVehicleBrand?: string | null;
  loanVehicleModel?: string | null;
};

type LeaveRequest = {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  status: string;
  employeeFirstName?: string;
  employeeLastName?: string;
};

type LoanReservation = {
  id: number;
  loanVehicleId: number;
  startDate: string;
  endDate: string | null;
  loanVehicleUniqueNumber?: string;
  loanVehicleLicensePlate?: string;
  loanVehicleBrand?: string;
  loanVehicleModel?: string;
  clientFirstName?: string;
  clientLastName?: string;
  interventionVehicleBrand?: string | null;
  interventionVehicleModel?: string | null;
  interventionVehicleType?: string | null;
};

type CalendarViewProps = {
  initialView: string;
  weekDays: number;
  dayStart: string;
  dayEnd: string;
  defaultDurationMins?: number;
  categories: { id: number; code: string; color: string }[];
  statuses: { id: number; code: string; color: string }[];
  leaveRequests?: LeaveRequest[];
  loanReservations?: LoanReservation[];
};

function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeOverlapColumns(
  items: { topPx: number; endPx: number }[]
): { columnIndex: number; totalColumns: number }[] {
  if (items.length === 0) return [];
  const sorted = items
    .map((item, i) => ({ ...item, i }))
    .sort((a, b) => a.topPx - b.topPx || a.endPx - b.endPx);
  const columns: number[] = [];
  const result: { columnIndex: number; totalColumns: number }[] = new Array(items.length);
  for (const { topPx, endPx, i } of sorted) {
    let col = 0;
    while (col < columns.length && columns[col] > topPx) col++;
    if (col === columns.length) columns.push(0);
    columns[col] = endPx;
    result[i] = { columnIndex: col, totalColumns: 0 };
  }
  const totalColumns = columns.length;
  for (let i = 0; i < result.length; i++) result[i].totalColumns = totalColumns;
  return result;
}

function rangesOverlap(a: { topPx: number; endPx: number }, b: { topPx: number; endPx: number }) {
  return a.topPx < b.endPx && b.topPx < a.endPx;
}

function computeOverlapColumnsPerGroup(
  items: { topPx: number; endPx: number }[]
): { columnIndex: number; totalColumns: number }[] {
  const n = items.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (x: number, y: number) => {
    parent[find(x)] = find(y);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rangesOverlap(items[i], items[j])) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  const result: { columnIndex: number; totalColumns: number }[] = new Array(n);
  for (const indices of groups.values()) {
    const groupItems = indices.map((i) => ({ topPx: items[i].topPx, endPx: items[i].endPx }));
    const cols = computeOverlapColumns(groupItems);
    indices.forEach((idx, pos) => {
      result[idx] = cols[pos];
    });
  }
  return result;
}

// Hauteur d'une HEURE à l'écran, et non d'un bloc : c'est elle qui reste constante
// quand on change le découpage. 88 px historiquement, soit 4 blocs de 22.
const HOUR_HEIGHT_DEFAULT_PX = 88;
// Valeurs proposées (réglage `calendarHourHeightPx`). Toutes MULTIPLES DE 4, et ce
// n'est pas une coquetterie : la colonne des heures et les lignes de la grille sont
// deux colonnes distinctes du DOM, et leur alignement n'est exact que si la hauteur
// de l'heure se divise sans reste par 4 (blocs de 15 min) et par 2 (blocs de 30).
// À 50 px, un bloc ferait 12,5 px et les traits se décaleraient d'un pixel selon
// l'arrondi du navigateur.
const HOUR_HEIGHT_ALLOWED_PX = [44, 56, 68, 80, 88, 100, 112, 120];
// Hauteur de la ligne des jours. Elle occupait environ 60 px sur deux lignes, avec
// une pastille ronde de 28 px les jours « aujourd'hui » qui imposait sa hauteur à
// toute la ligne. Ramenée à 16 px sur une seule ligne, elle rendait le nom du jour
// trop discret : 32 px est le compromis retenu, moitié de l'origine, et de quoi lire
// le nom entier.
const DAY_HEADER_HEIGHT_PX = 32;
// Hauteur de la pastille du jour courant, dans cette ligne. Deux pixels de jeu de
// part et d'autre : à hauteur égale elle remplirait la cellule et ne se lirait plus
// comme une pastille.
const DAY_PILL_HEIGHT_PX = DAY_HEADER_HEIGHT_PX - 10;
// Découpages proposés (réglage `calendarSlotMinutes`). Une heure y est coupée en 4,
// en 2, ou pas du tout.
const SLOT_MINUTES_ALLOWED = [15, 30, 60];
// Hauteur minimale d'un bloc de rendez-vous, en pixels et NON en fraction de bloc :
// avec des blocs d'une heure, une demi-hauteur de bloc ferait 44 px et exagérerait
// grossièrement la durée d'un rendez-vous de quinze minutes.
const MIN_EVENT_HEIGHT_PX = 11;
const APPOINTMENT_STATUS_BORDER_PX = 6;
const SLOT_CLICK_RIGHT_MARGIN_PX = 24;
// Ligne « Prêt · Absences » : deux lignes empilées, absences puis prêts. Resserrée
// de 70 à 42 px — 8/24/8/22/8 auparavant. Le texte reste en 11 px, donc lisible ;
// c'étaient les marges et l'écart qui coûtaient, pas le contenu.
const PRET_ABSENCES_PAD_PX = 2;
const PRET_ABSENCES_GAP_PX = 2;
const PRET_BOX_HEIGHT_PX = 18;
const ABSENCES_BOX_HEIGHT_PX = 18;
// Largeurs fixes, et NON déduites des hauteurs comme elles l'étaient (× 4 et × 2) :
// resserrer la hauteur rétrécissait alors les pastilles et tronquait les prénoms.
const ABSENCES_BOX_WIDTH_PX = 96;
const PRET_BOX_WIDTH_PX = 44;
const PRET_ABSENCES_ROW_HEIGHT_PX =
  PRET_ABSENCES_PAD_PX + ABSENCES_BOX_HEIGHT_PX + PRET_ABSENCES_GAP_PX +
  PRET_BOX_HEIGHT_PX + PRET_ABSENCES_PAD_PX;

// ─── Appointment block draggable ───────────────────────────────────────────────
function DraggableAptBlock({
  apt,
  topPx,
  heightPx,
  leftCalc,
  widthCalc,
  totalColumns,
  onEventClick,
  onMouseEnter,
  onMouseLeave,
}: {
  apt: Appointment;
  topPx: number;
  heightPx: number;
  leftCalc: string;
  widthCalc: string;
  totalColumns: number;
  onEventClick: (e: React.MouseEvent, apt: Appointment) => void;
  onMouseEnter: (e: React.MouseEvent, apt: Appointment) => void;
  onMouseLeave: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `apt-${apt.id}`,
    data: { apt, heightPx },
  });

  const blockHeight = heightPx - 2;
  const showSingleLineOnly = blockHeight < 30;
  const isNote = apt.appointmentType === "note";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-appointment-block
      onClick={(e) => {
        e.stopPropagation();
        onEventClick(e, apt);
      }}
      onMouseEnter={(e) => onMouseEnter(e, apt)}
      onMouseLeave={onMouseLeave}
      className="absolute rounded-md overflow-hidden flex flex-col items-start shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing"
      style={{
        left: leftCalc,
        width: widthCalc,
        top: topPx + 1,
        height: blockHeight,
        padding: `2px ${Math.max(2, 6 - (totalColumns - 1))}px 2px 8px`,
        background: apt.categoryColor || "#e0e0e0",
        borderLeft: `${APPOINTMENT_STATUS_BORDER_PX}px solid ${apt.statusColor || "#999"}`,
        fontSize: totalColumns > 3 ? "0.7rem" : "0.75rem",
        lineHeight: 1.25,
        zIndex: 1,
        opacity: isDragging ? 0.25 : 1,
        touchAction: "none",
      }}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium w-full">
        {isNote ? "Note" : `${apt.clientLastName ?? ""} / ${apt.vehicleLicensePlate ?? ""}`}
      </span>
      {!showSingleLineOnly && apt.prestation?.trim() && (
        <span className="overflow-hidden text-ellipsis whitespace-nowrap w-full opacity-90">
          {apt.prestation}
        </span>
      )}
      {!showSingleLineOnly &&
        (apt.loanVehicleUniqueNumber || apt.loanVehicleBrand || apt.loanVehicleModel) && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap w-full opacity-80">
            {[
              apt.loanVehicleUniqueNumber ?? "",
              [apt.loanVehicleBrand, apt.loanVehicleModel].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(" / ")}
          </span>
        )}
    </div>
  );
}

// ─── Day column droppable ──────────────────────────────────────────────────────
function DroppableDayColumn({
  id,
  className,
  style,
  onClick,
  children,
}: {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && "ring-2 ring-inset ring-primary/40")}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function CalendarView({
  initialView,
  weekDays,
  dayStart,
  dayEnd,
  defaultDurationMins = 15,
  categories,
  statuses,
  leaveRequests = [],
  loanReservations = [],
}: CalendarViewProps) {
  const [view, setView] = useState(initialView);
  const [baseDate, setBaseDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Les prêts arrivaient uniquement par la prop rendue côté serveur : après
  // l'enregistrement d'un RDV, seuls les RDV étaient rechargés et la pastille de
  // prêt n'apparaissait qu'après un rechargement complet de la page. On en tient
  // donc une copie locale, rafraîchie en même temps que les RDV. La prop sert
  // d'état initial, ce qui évite un affichage vide au premier rendu.
  const [loans, setLoans] = useState<LoanReservation[]>(loanReservations);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [slotEnd, setSlotEnd] = useState<Date | null>(null);
  const [reservationFormOpen, setReservationFormOpen] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [defaultDurationMinsFromSettings, setDefaultDurationMinsFromSettings] =
    useState<number>(defaultDurationMins);
  // Découpage de l'heure dans la grille, réglé dans Paramètres → Calendrier.
  const [slotMinutes, setSlotMinutes] = useState(15);
  const [hourHeightPx, setHourHeightPx] = useState(HOUR_HEIGHT_DEFAULT_PX);
  const [activeDrag, setActiveDrag] = useState<{ apt: Appointment; heightPx: number } | null>(null);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    fetch("/api/proxy/settings")
      .then((r) => r.json())
      .then((settings: { key: string; value: string }[]) => {
        const map: Record<string, string> = {};
        if (Array.isArray(settings)) settings.forEach((s) => (map[s.key] = s.value));
        const raw = map.calendarDefaultDurationMinutes ?? "15";
        const parsed = parseInt(raw, 10);
        const allowed = [15, 30, 60, 120, 240, 480];
        setDefaultDurationMinsFromSettings(allowed.includes(parsed) ? parsed : 15);

        const rawSlot = parseInt(map.calendarSlotMinutes ?? "15", 10);
        setSlotMinutes(SLOT_MINUTES_ALLOWED.includes(rawSlot) ? rawSlot : 15);

        const rawHour = parseInt(map.calendarHourHeightPx ?? "", 10);
        setHourHeightPx(
          HOUR_HEIGHT_ALLOWED_PX.includes(rawHour) ? rawHour : HOUR_HEIGHT_DEFAULT_PX
        );
      })
      .catch(() => {});
  }, []);

  const startMins = Math.floor(parseTime(dayStart) / 60) * 60;
  const endMins = Math.floor(parseTime(dayEnd) / 60) * 60;
  const totalMins = endMins - startMins;
  const slotCount = Math.floor(totalMins / slotMinutes);
  // L'heure conserve sa hauteur quel que soit le découpage : 22 px par bloc à 15 min,
  // 44 à 30, 88 à l'heure. Sans cela, passer au bloc d'une heure écraserait la
  // journée à un quart de sa hauteur.
  const slotHeightPx = (hourHeightPx * slotMinutes) / 60;

  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const days =
    view === "day"
      ? [baseDate]
      : view === "week"
        ? Array.from({ length: weekDays }, (_, i) => addDays(weekStart, i))
        : eachDayOfInterval({ start: startOfMonth(baseDate), end: endOfMonth(baseDate) });
  const displayDays = view === "week" || view === "day" ? (view === "day" ? 1 : weekDays) : 1;

  const periodStart = days[0] ? startOfDay(days[0]) : new Date(0);
  const periodEnd = days[days.length - 1] ? endOfDay(days[days.length - 1]) : new Date(0);
  const visibleLeaves = leaveRequests.filter((lr) => {
    const start = parseISO(lr.startDate);
    const end = parseISO(lr.endDate);
    return start <= periodEnd && end >= periodStart;
  });
  const visibleLoans = loans.filter((lr) => {
    const start = parseISO(lr.startDate);
    const end = lr.endDate ? parseISO(lr.endDate) : new Date(8640000000000000);
    return start <= periodEnd && end >= periodStart;
  });

  const fetchAppointments = useCallback(async () => {
    const start = new Date(days[0]);
    start.setHours(0, 0, 0, 0);
    const end = new Date(days[days.length - 1]);
    end.setHours(23, 59, 59, 999);
    const res = await fetch(
      `/api/proxy/appointments?start=${start.toISOString()}&end=${end.toISOString()}`
    );
    if (res.ok) {
      const data = await res.json();
      setAppointments(data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, baseDate.getTime(), days[0]?.getTime(), days[days.length - 1]?.getTime()]);

  const fetchLoans = useCallback(async () => {
    const res = await fetch("/api/proxy/loanReservations");
    if (res.ok) {
      const data = await res.json();
      setLoans(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  // Une prop rafraîchie par le serveur (router.refresh) doit reprendre la main sur
  // la copie locale, sinon un rechargement côté serveur serait ignoré.
  useEffect(() => {
    setLoans(loanReservations);
  }, [loanReservations]);

  const handleSlotClick = (date: Date, minutesFromStart: number) => {
    const start = new Date(date);
    const [h, m] = [Math.floor(startMins / 60), startMins % 60];
    start.setHours(h, m + minutesFromStart, 0, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + defaultDurationMinsFromSettings);
    setSlotStart(start);
    setSlotEnd(end);
    setEditingId(null);
    setFormOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, apt: Appointment) => {
    e.stopPropagation();
    setEditingId(apt.id);
    setSlotStart(parseISO(apt.startTime));
    setSlotEnd(parseISO(apt.endTime));
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingId(null);
    fetchAppointments();
    // Un RDV peut créer, modifier ou supprimer sa réservation de prêt liée : sans
    // ce rechargement, la pastille n'apparaissait qu'après un F5.
    fetchLoans();
  };

  // ─── Drag handlers ────────────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const { apt, heightPx } = event.active.data.current as { apt: Appointment; heightPx: number };
    setActiveDrag({ apt, heightPx });
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDrag(null);
      const { active, over, delta } = event;
      if (!over) return;

      const { apt } = active.data.current as { apt: Appointment };
      const targetDayISO = String(over.id);
      if (!/^\d{4}-\d{2}-\d{2}/.test(targetDayISO)) return;

      const originalStart = parseISO(apt.startTime);
      const durationMs = parseISO(apt.endTime).getTime() - originalStart.getTime();
      const durationMins = durationMs / 60000;

      // Compute new start: original time + vertical delta snapped to 15 min
      const deltaMinutes = Math.round(delta.y / slotHeightPx) * slotMinutes;
      const originalStartMins = originalStart.getHours() * 60 + originalStart.getMinutes();
      let newStartMins = originalStartMins + deltaMinutes;

      // Clamp within visible day range
      newStartMins = Math.max(startMins, Math.min(endMins - durationMins, newStartMins));
      // Snap to 15-min grid
      newStartMins = Math.round(newStartMins / slotMinutes) * slotMinutes;

      const targetDay = parseISO(targetDayISO);
      const newStart = new Date(targetDay);
      newStart.setHours(Math.floor(newStartMins / 60), newStartMins % 60, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Skip if nothing changed
      if (
        newStart.toISOString() === originalStart.toISOString() &&
        isSameDay(targetDay, originalStart)
      )
        return;

      // Optimistic update
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === apt.id
            ? { ...a, startTime: newStart.toISOString(), endTime: newEnd.toISOString() }
            : a
        )
      );

      try {
        const res = await fetch(`/api/proxy/appointments/${apt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startTime: newStart.toISOString(),
            endTime: newEnd.toISOString(),
          }),
        });
        if (!res.ok) fetchAppointments();
      } catch {
        fetchAppointments();
      }
    },
    [startMins, endMins, fetchAppointments]
  );

  // ──────────────────────────────────────────────────────────────────────────

  const prev = () =>
    setBaseDate((d) =>
      view === "month" ? addDays(startOfMonth(d), -1) : addDays(d, view === "week" ? -7 : -1)
    );
  const next = () =>
    setBaseDate((d) =>
      view === "month" ? addDays(endOfMonth(d), 1) : addDays(d, view === "week" ? 7 : 1)
    );
  const today = () => setBaseDate(new Date());

  const [tooltipApt, setTooltipApt] = useState<Appointment | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const showTooltip = (e: React.MouseEvent, apt: Appointment) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipApt(apt);
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
  };
  const hideTooltip = () => {
    setTooltipApt(null);
    setTooltipPos(null);
  };

  // Infobulle des pastilles de prêt. Elle remplace l'attribut `title` natif, dont
  // le navigateur impose un délai d'une à deux secondes avant l'affichage — trop
  // lent quand on balaie une ligne de prêts. Le même état pilote la position.
  const [tooltipLoan, setTooltipLoan] = useState<LoanReservation | null>(null);
  const [tooltipLoanPos, setTooltipLoanPos] = useState<{ x: number; y: number } | null>(null);
  const showLoanTooltip = (e: React.MouseEvent, r: LoanReservation) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipLoan(r);
    setTooltipLoanPos({ x: rect.left + rect.width / 2, y: rect.bottom });
  };
  const hideLoanTooltip = () => {
    setTooltipLoan(null);
    setTooltipLoanPos(null);
  };

  const titleText =
    view === "week"
      ? `Semaine du ${format(days[0], "d MMMM y", { locale: fr })}`
      : view === "month"
        ? format(baseDate, "MMMM y", { locale: fr })
        : format(baseDate, "EEEE d MMMM y", { locale: fr });

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b bg-card">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" onClick={prev} aria-label="Précédent">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={today}>
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="icon" onClick={next} aria-label="Suivant">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 ml-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <span className="text-base font-semibold tracking-tight first-letter:capitalize">
              {titleText}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select value={view} onValueChange={setView}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Jour</SelectItem>
                <SelectItem value="week">Semaine</SelectItem>
                <SelectItem value="month">Mois</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setSlotStart(new Date());
                setSlotEnd(null);
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nouveau RDV
            </Button>
          </div>
        </div>

        {/* Calendar body — week / day */}
        {(view === "week" || view === "day") && (
          <div className="flex-1 overflow-auto scrollbar-thin bg-card">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `64px repeat(${displayDays}, minmax(0, 1fr))`,
                gridTemplateRows: `auto auto ${slotCount * slotHeightPx}px`,
              }}
            >
              {/* Top-left empty cell */}
              <div className="sticky top-0 z-10 bg-card border-b border-r" />

              {/* Day headers */}
              {days.map((d) => {
                const _today = isToday(d);
                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "sticky top-0 z-10 flex items-center justify-center gap-1.5 border-b border-r bg-card px-2 leading-none",
                      _today && "bg-primary/5"
                    )}
                    style={{ height: DAY_HEADER_HEIGHT_PX }}
                  >
                    {/* Nom entier, y compris en vue semaine : c'est lui qu'on lit en
                        premier. « MERCREDI 3 » en 11 px majuscules occupe environ 80 px,
                        pour une colonne de 140 px à sept jours — il tient. */}
                    {_today ? (
                      /* Pastille englobant le nom ET le numéro. Hauteur fixée à 14 px
                         dans une ligne de 16 : un pixel de part et d'autre, sans quoi
                         elle remplirait la cellule et ne se lirait plus comme une
                         pastille. L'ancienne, ronde et autour du seul numéro, mesurait
                         28 px et imposait sa hauteur à toute la ligne. */
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 text-primary-foreground"
                        style={{ height: DAY_PILL_HEIGHT_PX }}
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wide">
                          {format(d, "EEEE", { locale: fr })}
                        </span>
                        <span className="text-[13px] font-bold tabular-nums">
                          {format(d, "d", { locale: fr })}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {format(d, "EEEE", { locale: fr })}
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {format(d, "d", { locale: fr })}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Loan & leave row label */}
              <div
                className="px-2 border-b border-r bg-secondary/30 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center"
                style={{ minHeight: PRET_ABSENCES_ROW_HEIGHT_PX }}
              >
                Prêt · Absences
              </div>

              {/* Loan & leave columns */}
              {days.map((day) => {
                const leavesOnDay = visibleLeaves.filter((lr) => {
                  const start = parseISO(lr.startDate);
                  const end = parseISO(lr.endDate);
                  return start <= endOfDay(day) && end >= startOfDay(day);
                });
                const loansOnDay = visibleLoans.filter((r) => {
                  const start = parseISO(r.startDate);
                  const end = r.endDate ? parseISO(r.endDate) : new Date(8640000000000000);
                  return start <= endOfDay(day) && end >= startOfDay(day);
                });
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-b border-r flex flex-col px-1.5 bg-secondary/30",
                      isToday(day) && "bg-primary/5"
                    )}
                    style={{
                      minHeight: PRET_ABSENCES_ROW_HEIGHT_PX,
                      paddingTop: PRET_ABSENCES_PAD_PX,
                      paddingBottom: PRET_ABSENCES_PAD_PX,
                      rowGap: PRET_ABSENCES_GAP_PX,
                    }}
                  >
                    <div
                      className="flex flex-wrap items-center gap-1"
                      style={{ minHeight: ABSENCES_BOX_HEIGHT_PX }}
                    >
                      {leavesOnDay.map((lr) => (
                        <div
                          key={`${day.toISOString()}-${lr.id}`}
                          className="flex items-center justify-center rounded text-[11px] font-medium px-1 overflow-hidden whitespace-nowrap"
                          style={{
                            width: ABSENCES_BOX_WIDTH_PX,
                            height: ABSENCES_BOX_HEIGHT_PX,
                            background: "rgba(217, 119, 6, 0.15)",
                            color: "rgb(146, 64, 14)",
                            border: "1px solid rgba(217, 119, 6, 0.3)",
                          }}
                          title={
                            `${lr.employeeFirstName ?? ""} ${lr.employeeLastName ?? ""}`.trim() ||
                            `Salarié #${lr.employeeId}`
                          }
                        >
                          {lr.employeeFirstName?.trim() || `#${lr.employeeId}`}
                        </div>
                      ))}
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      style={{ minHeight: PRET_BOX_HEIGHT_PX }}
                    >
                      {loansOnDay.map((r) => (
                        <button
                          key={`${day.toISOString()}-${r.id}`}
                          type="button"
                          onClick={() => {
                            setEditingReservationId(r.id);
                            setReservationFormOpen(true);
                          }}
                          className="flex items-center justify-center rounded text-[11px] font-semibold cursor-pointer transition-opacity hover:opacity-80"
                          style={{
                            width: PRET_BOX_WIDTH_PX,
                            height: PRET_BOX_HEIGHT_PX,
                            background: "rgba(5, 150, 105, 0.15)",
                            color: "rgb(6, 95, 70)",
                            border: "1px solid rgba(5, 150, 105, 0.3)",
                          }}
                          onMouseEnter={(e) => showLoanTooltip(e, r)}
                          onMouseLeave={hideLoanTooltip}
                        >
                          {r.loanVehicleUniqueNumber ?? `#${r.loanVehicleId}`}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Hours column */}
              <div
                className="flex flex-col border-r bg-card"
                style={{ gridColumn: "1", gridRow: "3", height: slotCount * slotHeightPx }}
              >
                {Array.from({ length: Math.floor(totalMins / 60) }).map((_, hourIdx) => (
                  <div
                    key={hourIdx}
                    className="border-b text-[11px] text-muted-foreground flex items-start justify-end pr-2 pt-0.5 font-medium tabular-nums"
                    style={{ height: hourHeightPx }}
                  >
                    {String(Math.floor(startMins / 60) + hourIdx).padStart(2, "0")}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((day) => {
                const _today = isToday(day);
                const dayISO = format(day, "yyyy-MM-dd");
                const dayAppointments = appointments.filter((a) =>
                  isSameDay(parseISO(a.startTime), day)
                );
                const slotCountPx = slotCount * slotHeightPx;
                const blocks = dayAppointments.map((apt) => {
                  const start = parseISO(apt.startTime);
                  const end = parseISO(apt.endTime);
                  const startMinsFromDay = start.getHours() * 60 + start.getMinutes() - startMins;
                  const endMinsFromDay = end.getHours() * 60 + end.getMinutes() - startMins;
                  const rawTopPx = (startMinsFromDay / slotMinutes) * slotHeightPx;
                  const rawEndPx = (endMinsFromDay / slotMinutes) * slotHeightPx;
                  const topPx = Math.max(0, Math.min(slotCountPx, rawTopPx));
                  const endPx = Math.max(topPx, Math.min(slotCountPx, rawEndPx));
                  const heightPx = Math.max(MIN_EVENT_HEIGHT_PX, endPx - topPx);
                  return { apt, topPx, endPx, heightPx };
                });
                const columns = computeOverlapColumnsPerGroup(
                  blocks.map((b) => ({ topPx: b.topPx, endPx: b.endPx }))
                );
                const marginSide = 3;
                const gapPx = 2;
                const totalHorizontalMargin = marginSide * 2 + SLOT_CLICK_RIGHT_MARGIN_PX;

                return (
                  <DroppableDayColumn
                    key={day.toISOString()}
                    id={dayISO}
                    className={cn(
                      "relative border-r cursor-pointer",
                      _today ? "bg-primary/5" : "bg-card"
                    )}
                    style={{ gridRow: "3", height: slotCount * slotHeightPx }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-appointment-block]")) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const relativeY = e.clientY - rect.top;
                      const slotIdx = Math.max(
                        0,
                        Math.min(slotCount - 1, Math.floor(relativeY / slotHeightPx))
                      );
                      handleSlotClick(day, slotIdx * slotMinutes);
                    }}
                  >
                    {/* Slot lines */}
                    {Array.from({ length: slotCount }).map((_, slotIdx) => {
                      const isHourEnd = (slotIdx + 1) % 4 === 0;
                      return (
                        <div
                          key={slotIdx}
                          className={cn(
                            "absolute left-0 right-0 pointer-events-none",
                            isHourEnd ? "border-b border-border" : "border-b border-border/40"
                          )}
                          style={{ top: slotIdx * slotHeightPx, height: slotHeightPx, zIndex: 0 }}
                        />
                      );
                    })}

                    {/* Appointment blocks */}
                    {blocks.map(({ apt, topPx, heightPx }, i) => {
                      const { columnIndex, totalColumns } = columns[i];
                      const N = Math.max(1, totalColumns);
                      const totalBorder = N * APPOINTMENT_STATUS_BORDER_PX;
                      const widthCalc = `calc((100% - ${totalHorizontalMargin}px - ${totalBorder}px - ${(N - 1) * gapPx}px) / ${N})`;
                      const stepCalc = `calc((100% - ${totalHorizontalMargin}px - ${totalBorder}px - ${(N - 1) * gapPx}px) / ${N} + ${gapPx}px + ${APPOINTMENT_STATUS_BORDER_PX}px)`;
                      const leftCalc =
                        columnIndex === 0
                          ? `${marginSide}px`
                          : `calc(${marginSide}px + ${columnIndex} * ${stepCalc})`;

                      return (
                        <DraggableAptBlock
                          key={apt.id}
                          apt={apt}
                          topPx={topPx}
                          heightPx={heightPx}
                          leftCalc={leftCalc}
                          widthCalc={widthCalc}
                          totalColumns={N}
                          onEventClick={handleEventClick}
                          onMouseEnter={showTooltip}
                          onMouseLeave={hideTooltip}
                        />
                      );
                    })}
                  </DroppableDayColumn>
                );
              })}
            </div>
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="flex-1 overflow-auto p-6 scrollbar-thin">
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-secondary/30">
                <p className="text-sm text-muted-foreground">
                  Vue mois — liste des rendez-vous du mois
                </p>
              </div>
              <div className="divide-y">
                {appointments
                  .filter((a) => {
                    const start = parseISO(a.startTime);
                    return (
                      start.getMonth() === baseDate.getMonth() &&
                      start.getFullYear() === baseDate.getFullYear()
                    );
                  })
                  .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
                  .map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 cursor-pointer"
                      onClick={() =>
                        handleEventClick({ stopPropagation: () => {} } as React.MouseEvent, apt)
                      }
                    >
                      <Badge variant="secondary" className="tabular-nums">
                        {format(parseISO(apt.startTime), "dd/MM HH:mm", { locale: fr })}
                      </Badge>
                      <span className="font-medium text-sm">
                        {apt.appointmentType === "note"
                          ? "Note"
                          : `${apt.clientLastName ?? ""} / ${apt.vehicleLicensePlate ?? ""}`}
                      </span>
                      {apt.prestation?.trim() && (
                        <span className="text-sm text-muted-foreground truncate">
                          — {apt.prestation}
                        </span>
                      )}
                    </div>
                  ))}
                {appointments.filter((a) => {
                  const start = parseISO(a.startTime);
                  return (
                    start.getMonth() === baseDate.getMonth() &&
                    start.getFullYear() === baseDate.getFullYear()
                  );
                }).length === 0 && (
                  <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Aucun rendez-vous ce mois-ci
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {formOpen && (
          <AppointmentForm
            editingId={editingId}
            initialStart={slotStart || undefined}
            initialEnd={slotEnd || undefined}
            categories={categories}
            statuses={statuses}
            defaultDurationMins={defaultDurationMinsFromSettings}
            onClose={handleFormClose}
            onSaved={handleFormClose}
          />
        )}

        {reservationFormOpen && (
          <LoanReservationForm
            editingId={editingReservationId}
            onClose={() => setReservationFormOpen(false)}
            onSaved={() => {
              setReservationFormOpen(false);
              fetchLoans();
              router.refresh();
            }}
          />
        )}

        {tooltipLoan && tooltipLoanPos && (
          <div
            role="tooltip"
            className={TOOLTIP_CLASS}
            style={{
              left: tooltipLoanPos.x,
              top: tooltipLoanPos.y + 8,
              transform: "translate(-50%, 0)",
            }}
          >
            <LoanTooltipBody res={tooltipLoan} />
          </div>
        )}

        {tooltipApt && tooltipPos && (
          <div
            role="tooltip"
            className={TOOLTIP_CLASS}
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y - 8,
              transform: "translate(-50%, -100%)",
            }}
          >
            <AppointmentTooltipBody apt={tooltipApt} />
          </div>
        )}
      </div>

      {/* Drag overlay — ghost suivant le curseur */}
      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div
            className="rounded-md overflow-hidden flex flex-col items-start shadow-xl ring-2 ring-primary/60 rotate-1 opacity-90"
            style={{
              width: 160,
              height: Math.max(20, activeDrag.heightPx - 2),
              padding: "2px 6px 2px 8px",
              background: activeDrag.apt.categoryColor || "#e0e0e0",
              borderLeft: `${APPOINTMENT_STATUS_BORDER_PX}px solid ${activeDrag.apt.statusColor || "#999"}`,
              fontSize: "0.75rem",
              lineHeight: 1.25,
            }}
          >
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium w-full">
              {activeDrag.apt.appointmentType === "note"
                ? "Note"
                : `${activeDrag.apt.clientLastName ?? ""} / ${activeDrag.apt.vehicleLicensePlate ?? ""}`}
            </span>
            {activeDrag.apt.prestation?.trim() && (
              <span className="overflow-hidden text-ellipsis whitespace-nowrap w-full opacity-90">
                {activeDrag.apt.prestation}
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
