"use client";

import { format, parseISO } from "date-fns";
import { appointmentStatusLabels, getLabel } from "@/lib/labels";

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
  statusCode?: string;
  statusColor?: string;
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

/**
 * Noir ou blanc, selon ce qui se lit sur la couleur donnée.
 *
 * Les couleurs d'état sont modifiables par le garage (§ 81) : on ne peut pas
 * décider une fois pour toutes que le texte sera blanc. La luminance perçue
 * tranche — pondérations usuelles du rouge, du vert et du bleu, le vert comptant
 * le plus parce que l'œil y est le plus sensible.
 *
 * Seuil à 0,6 plutôt qu'à 0,5 : sur les teintes moyennes, le texte sombre reste
 * lisible plus longtemps que le clair.
 */
function texteSur(fond: string): string {
  const hex = fond.trim().replace("#", "");
  const complet =
    hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(complet)) return "#111111";
  const r = parseInt(complet.slice(0, 2), 16) / 255;
  const v = parseInt(complet.slice(2, 4), 16) / 255;
  const b = parseInt(complet.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * v + 0.114 * b > 0.6 ? "#111111" : "#ffffff";
}

/** Cartouche de l'état : son libellé sur sa couleur. */
export function StatusBadge({ code, color }: { code: string; color?: string }) {
  const fond = color?.trim() || "#9ca3af";
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ background: fond, color: texteSur(fond) }}
    >
      {getLabel(appointmentStatusLabels, code) || code}
    </span>
  );
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
      {/* L'état en dernier, dans un cartouche à sa couleur : c'est l'information
          que l'on cherche d'un coup d'œil, et la seule que le bloc ne montrait
          que par une bordure de 6 px, sans la nommer. Pas d'état sur une note,
          qui n'en porte pas. */}
      {!isNote && apt.statusCode && (
        <div className="mt-1">
          <StatusBadge code={apt.statusCode} color={apt.statusColor} />
        </div>
      )}
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
