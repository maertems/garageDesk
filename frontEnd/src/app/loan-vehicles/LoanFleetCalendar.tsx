"use client";

import { useMemo } from "react";
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
  clientFirstName?: string;
  clientLastName?: string;
};

const DAYS_COUNT = 30;

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

  return (
    <div>
      <div className="rounded-xl border bg-card shadow-card overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card z-10 text-left font-medium text-muted-foreground px-3 py-2 border-b whitespace-nowrap">
                Véhicule
              </th>
              {days.map((d, i) => {
                const isToday = i === 0;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const isFirstOfMonth = d.getDate() === 1;
                return (
                  <th
                    key={d.toISOString()}
                    className={cn(
                      "px-0.5 py-1.5 border-b text-center font-normal text-muted-foreground w-7 min-w-[1.75rem]",
                      isWeekend && "bg-secondary/40",
                      isToday && "bg-primary/10 text-primary font-semibold"
                    )}
                    title={d.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  >
                    <div className="leading-none">{d.getDate()}</div>
                    <div className="text-[9px] opacity-70 leading-none mt-0.5">
                      {isFirstOfMonth ? d.toLocaleDateString("fr-FR", { month: "short" }) : " "}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, idx) => {
              const vehicleLabel = [v.brand, v.model].filter(Boolean).join(" ") || v.uniqueNumber;
              const rowBg = idx % 2 === 1 ? "bg-primary/10" : "";
              const vehicleReservations = reservations.filter(
                (r) =>
                  r.loanVehicleId === v.id &&
                  startOfDay(new Date(r.startDate)) <= windowEnd &&
                  (r.endDate == null || startOfDay(new Date(r.endDate)) >= windowStart)
              );
              return (
                <tr key={v.id} className={rowBg}>
                  <td className="sticky left-0 bg-inherit z-10 px-3 py-1.5 border-b whitespace-nowrap font-medium">
                    {vehicleLabel}
                    <span className="text-muted-foreground font-normal"> — {v.licensePlate}</span>
                  </td>
                  {days.map((d, i) => {
                    const isToday = i === 0;
                    const res = vehicleReservations.find((r) => {
                      const start = startOfDay(new Date(r.startDate));
                      const end = r.endDate ? startOfDay(new Date(r.endDate)) : windowEnd;
                      return d >= start && d <= end;
                    });
                    return (
                      <td
                        key={d.toISOString()}
                        onClick={res && onReservationClick ? () => onReservationClick(res.id) : undefined}
                        className={cn(
                          "border-b h-7 w-7 min-w-[1.75rem]",
                          isToday && "ring-1 ring-inset ring-primary/50",
                          res
                            ? "bg-amber-400/70 dark:bg-amber-600/60 cursor-pointer hover:bg-amber-400"
                            : rowBg
                        )}
                        title={
                          res
                            ? `${[res.clientFirstName, res.clientLastName].filter(Boolean).join(" ")} — du ${new Date(
                                res.startDate
                              ).toLocaleDateString("fr-FR")}${
                                res.endDate
                                  ? ` au ${new Date(res.endDate).toLocaleDateString("fr-FR")}`
                                  : " (en cours)"
                              }`
                            : undefined
                        }
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400/70 dark:bg-amber-600/60" />
          Réservé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm ring-1 ring-inset ring-primary/50" />
          Aujourd&apos;hui
        </span>
      </div>
    </div>
  );
}
