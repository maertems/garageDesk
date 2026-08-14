"use client";

import { format, parseISO } from "date-fns";

/**
 * Contenu des deux infobulles du calendrier, extrait de CalendarView pour être
 * rendu isolément lors des contrôles visuels — une copie dans une page de
 * prévisualisation aurait divergé du code livré.
 *
 * Le positionnement reste dans CalendarView : lui seul connaît la position du
 * curseur. Ici, uniquement les lignes affichées.
 *
 * Ces infobulles remplacent l'attribut `title` natif, dont le navigateur impose
 * une à deux secondes de délai.
 */

export type AppointmentTooltipData = {
  appointmentType?: string;
  clientFirstName?: string;
  clientLastName?: string;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  vehicleType?: string | null;
  vehicleLicensePlate?: string;
  prestation?: string | null;
  loanVehicleUniqueNumber?: string | null;
  loanVehicleBrand?: string | null;
  loanVehicleModel?: string | null;
};

export type LoanTooltipData = {
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

export const TOOLTIP_CLASS =
  "fixed z-[10000] px-3 py-2 bg-popover border rounded-md shadow-md text-xs leading-relaxed whitespace-nowrap pointer-events-none";

/** « Volkswagen Polo Life » — marque, modèle puis finition, les vides ignorés. */
export function formatClientVehicle(
  brand?: string | null,
  model?: string | null,
  type?: string | null
): string {
  return [brand, model, type].filter(Boolean).join(" ").trim();
}

export function formatLoanVehicleDisplay(r: LoanTooltipData): string {
  const model = [r.loanVehicleBrand, r.loanVehicleModel].filter(Boolean).join(" ") || "";
  const plate = r.loanVehicleLicensePlate ?? "";
  return model && plate
    ? `${model} — ${plate}`
    : (plate || model || r.loanVehicleUniqueNumber) ?? String(r.loanVehicleId);
}

function clientName(first?: string, last?: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "—";
}

/** Infobulle d'un rendez-vous : client, véhicule, intervention, véhicule de prêt. */
export function AppointmentTooltipBody({ apt }: { apt: AppointmentTooltipData }) {
  const isNote = apt.appointmentType === "note";
  const vehicle = formatClientVehicle(apt.vehicleBrand, apt.vehicleModel, apt.vehicleType);
  const loan = [
    apt.loanVehicleUniqueNumber ?? "",
    [apt.loanVehicleBrand, apt.loanVehicleModel].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="font-semibold">
        {isNote ? "Note" : clientName(apt.clientFirstName, apt.clientLastName)}
      </div>
      {!isNote && (vehicle || apt.vehicleLicensePlate) && (
        <div className="text-muted-foreground">{vehicle || apt.vehicleLicensePlate}</div>
      )}
      {/* Intervention : ce que l'on vient faire, l'information la plus utile au
          survol et la seule qui manquait. */}
      {apt.prestation?.trim() && (
        <div className="text-muted-foreground">{apt.prestation.trim()}</div>
      )}
      {loan && <div className="text-muted-foreground">Prêt : {loan}</div>}
    </>
  );
}

/** Infobulle d'une pastille de prêt : véhicule prêté, période, client, son véhicule. */
export function LoanTooltipBody({ res }: { res: LoanTooltipData }) {
  return (
    <>
      {/* Véhicule et période sur une seule ligne. Sans date de fin, la ligne
          s'arrête sur le tiret — même convention que la colonne Fin du tableau des
          réservations, où un prêt en cours est marqué d'un tiret. */}
      <div className="font-semibold">
        {formatLoanVehicleDisplay(res)}
        <span className="font-normal text-muted-foreground">
          {"  ·  "}
          {format(parseISO(res.startDate), "d/M")}
          {" – "}
          {res.endDate ? format(parseISO(res.endDate), "d/M") : ""}
        </span>
      </div>
      {/* Une ligne par information : le client, puis son véhicule. */}
      <div>{clientName(res.clientFirstName, res.clientLastName)}</div>
      <div className="text-muted-foreground">
        {formatClientVehicle(
          res.interventionVehicleBrand,
          res.interventionVehicleModel,
          res.interventionVehicleType
        ) || "—"}
      </div>
      <div className="text-muted-foreground italic">Cliquer pour modifier</div>
    </>
  );
}
