"use client";

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";

type LoanVehicle = {
  id: number;
  brand?: string;
  model?: string;
  licensePlate: string;
  uniqueNumber: string;
};
type LoanReservation = {
  id: number;
  loanVehicleId: number;
  startDate: string;
  endDate: string | null;
  appointmentId?: number | null;
  clientFirstName?: string;
  clientLastName?: string;
  interventionVehicleBrand?: string | null;
  interventionVehicleModel?: string | null;
};

const DAYS_COUNT = 30;
const LABEL_COL = "320px";

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function LoanFleetCalendar({
  vehicles,
  reservations,
  onReservationClick,
}: {
  vehicles: LoanVehicle[];
  reservations: LoanReservation[];
  onReservationClick?: (id: number) => void;
}) {
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: DAYS_COUNT }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  if (vehicles.length === 0) return null;

  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  const gridTemplateColumns = `${LABEL_COL} repeat(${DAYS_COUNT}, minmax(22px, 1fr))`;

  return (
    <div>
      <div className="rounded-xl border bg-card shadow-card overflow-x-auto">
        <div className="grid min-w-[1000px]" style={{ gridTemplateColumns }}>
          {/* En-tête */}
          <div
            className="sticky left-0 bg-card z-20 text-left text-xs font-medium text-muted-foreground px-3 py-2 border-b"
            style={{ gridColumn: 1, gridRow: 1 }}
          >
            Véhicule
          </div>
          {days.map((d, i) => {
            const isFirstOfMonth = d.getDate() === 1;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            // Teintes réservées à la bande des numéros de jours : week-end plus foncé
            // que la teinte de mois, elle-même plus foncée qu'un jour ordinaire.
            const dayTint = isWeekend
              ? "bg-muted-foreground/30"
              : d.getMonth() % 2 === 0
                ? "bg-muted-foreground/15"
                : "";
            return (
              <div
                key={d.toISOString()}
                style={{ gridColumn: i + 2, gridRow: 1 }}
                className={cn(
                  "px-0.5 py-1.5 border-b border-r border-border/30 text-center text-[10px] text-muted-foreground",
                  dayTint
                )}
                title={d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              >
                <div className="leading-none">{d.getDate()}</div>
                <div className="text-[9px] opacity-70 leading-none mt-0.5">
                  {isFirstOfMonth ? d.toLocaleDateString("fr-FR", { month: "short" }) : " "}
                </div>
              </div>
            );
          })}

          {/* Lignes véhicules */}
          {vehicles.map((v, rowIdx) => {
            const row = rowIdx + 2;
            const vehicleLabel = [v.brand, v.model].filter(Boolean).join(" ") || v.uniqueNumber;
            const rowBg = rowIdx % 2 === 1 ? "bg-primary/10" : "";
            const vehicleReservations = reservations.filter(
              (r) =>
                r.loanVehicleId === v.id &&
                startOfDay(new Date(r.startDate)) <= windowEnd &&
                (r.endDate == null || startOfDay(new Date(r.endDate)) >= windowStart)
            );
            return (
              <Fragment key={v.id}>
                <div
                  key={`label-${v.id}`}
                  style={{ gridColumn: 1, gridRow: row }}
                  className={cn(
                    "sticky left-0 z-20 px-3 py-2 border-b truncate text-xs font-medium",
                    rowBg || "bg-card"
                  )}
                  title={`${vehicleLabel} — ${v.licensePlate}`}
                >
                  {vehicleLabel}
                  <span className="text-muted-foreground font-normal"> — {v.licensePlate}</span>
                </div>
                {days.map((d, i) => (
                  <div
                    key={`cell-${v.id}-${i}`}
                    style={{ gridColumn: i + 2, gridRow: row }}
                    className={cn("border-b border-r border-border/30 h-9", rowBg)}
                  />
                ))}
                {vehicleReservations.map((r) => {
                  const start = startOfDay(new Date(r.startDate));
                  const end = r.endDate ? startOfDay(new Date(r.endDate)) : windowEnd;
                  const startIdx = Math.max(
                    0,
                    Math.round((start.getTime() - windowStart.getTime()) / 86400000)
                  );
                  const endIdx = Math.min(
                    DAYS_COUNT - 1,
                    Math.round((end.getTime() - windowStart.getTime()) / 86400000)
                  );
                  const clientName = [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ");
                  const interventionVehicle = [r.interventionVehicleBrand, r.interventionVehicleModel]
                    .filter(Boolean)
                    .join(" ");
                  const tooltip = [
                    clientName,
                    r.appointmentId && interventionVehicle ? `Intervention : ${interventionVehicle}` : null,
                    `Du ${new Date(r.startDate).toLocaleDateString("fr-FR")}${
                      r.endDate ? ` au ${new Date(r.endDate).toLocaleDateString("fr-FR")}` : " (en cours)"
                    }`,
                  ]
                    .filter(Boolean)
                    .join(" — ");
                  return (
                    <div
                      key={`res-${r.id}`}
                      style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}`, gridRow: row }}
                      className="relative z-10 mx-1 my-[5px] rounded-md bg-sky-200/90 dark:bg-sky-700/60 text-sky-900 dark:text-sky-50 shadow-sm hover:shadow-md flex items-center px-1.5 text-[11px] font-medium overflow-hidden whitespace-nowrap cursor-pointer transition-shadow"
                      title={tooltip}
                      onClick={onReservationClick ? () => onReservationClick(r.id) : undefined}
                    >
                      <span className="truncate">{clientName}</span>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-sky-200/90 dark:bg-sky-700/60" />
          Réservé
        </span>
      </div>
    </div>
  );
}
