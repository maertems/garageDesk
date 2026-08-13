// Case « Véhicule » partagée par le calendrier de disponibilité et le tableau
// des réservations : marque/modèle à gauche, immatriculation alignée à droite.
// La largeur est définie ici pour que les deux tableaux restent alignés.
export const VEHICLE_COL = "240px";
// Largeur utile = colonne moins le padding horizontal px-3 (2 × 0.75rem).
// Une largeur définie est nécessaire pour que `truncate` opère dans une cellule
// de tableau en `table-layout: auto`.
export const VEHICLE_COL_INNER = "calc(240px - 1.5rem)";

export default function VehicleLabel({
  label,
  plate,
  width,
}: {
  label: string;
  plate?: string;
  width?: string;
}) {
  return (
    <div
      className="flex w-full min-w-0 items-baseline justify-between gap-2"
      style={width ? { width } : undefined}
    >
      <span className="truncate font-medium">{label}</span>
      {plate ? <span className="shrink-0 font-normal text-muted-foreground">{plate}</span> : null}
    </div>
  );
}
