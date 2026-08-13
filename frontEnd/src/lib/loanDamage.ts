/**
 * Dégâts d'un véhicule de prêt : codes, libellés français et géométrie du schéma.
 *
 * MIROIR de backEnd/app/services/loan_contract_pdf.py — la table ZONES, les codes
 * d'éléments et les libellés doivent rester identiques des deux côtés, sinon le
 * schéma cliquable et le schéma imprimé sur le contrat ne désignent plus les mêmes
 * endroits. Repère normalisé 100 × 240 (largeur × longueur), avant en haut.
 */

export type DamageElement =
  | "bumperFront"
  | "hood"
  | "windshield"
  | "roof"
  | "rearWindow"
  | "trunk"
  | "bumperRear"
  | "fenderFrontLeft"
  | "doorFrontLeft"
  | "windowFrontLeft"
  | "windowRearLeft"
  | "doorRearLeft"
  | "fenderRearLeft"
  | "rockerPanelLeft"
  | "fenderFrontRight"
  | "doorFrontRight"
  | "windowFrontRight"
  | "windowRearRight"
  | "doorRearRight"
  | "fenderRearRight"
  | "rockerPanelRight";

export type DamageRow = "top" | "middle" | "bottom";
export type DamageCol = "left" | "center" | "right";
export type DamageType = "scratch" | "dent" | "broken" | "missing";

export type LoanVehicleDamage = {
  id: number;
  loanVehicleId: number;
  element: DamageElement;
  cellRow: DamageRow;
  cellCol: DamageCol;
  type: DamageType;
  note?: string | null;
};

export const CAR_W = 100;
export const CAR_H = 240;

/** (x, y, largeur, hauteur) dans le repère 100 × 240. Pave l'empreinte du véhicule. */
export const ZONES: Record<DamageElement, [number, number, number, number]> = {
  // Pare-chocs : toute la largeur, c'est là que se concentrent les impacts d'angle
  bumperFront: [2, 2, 96, 18],
  bumperRear: [2, 220, 96, 18],
  // Colonne centrale
  hood: [30, 20, 40, 44],
  windshield: [30, 64, 40, 24],
  roof: [30, 88, 40, 64],
  rearWindow: [30, 152, 40, 24],
  trunk: [30, 176, 40, 44],
  // Côté gauche : bas de caisse au plus extérieur, vitres au plus près de l'habitacle
  rockerPanelLeft: [2, 64, 7, 112],
  fenderFrontLeft: [2, 20, 28, 44],
  doorFrontLeft: [9, 64, 11, 56],
  windowFrontLeft: [20, 64, 10, 56],
  doorRearLeft: [9, 120, 11, 56],
  windowRearLeft: [20, 120, 10, 56],
  fenderRearLeft: [2, 176, 28, 44],
  // Côté droit : miroir
  rockerPanelRight: [91, 64, 7, 112],
  fenderFrontRight: [70, 20, 28, 44],
  doorFrontRight: [80, 64, 11, 56],
  windowFrontRight: [70, 64, 10, 56],
  doorRearRight: [80, 120, 11, 56],
  windowRearRight: [70, 120, 10, 56],
  fenderRearRight: [70, 176, 28, 44],
};

/**
 * Roues décoratives : à cheval sur le bord de caisse, aux quatre positions
 * d'essieu. Purement graphiques — aucune zone cliquable, aucun dégât ne s'y pose.
 * Sans elles, le pavage se lit comme une grille de rectangles, pas comme une
 * voiture. Mêmes valeurs dans le service PDF.
 */
export const WHEEL_W = 5;
export const WHEEL_H = 20;
export const WHEELS_X = [0, 95];
export const WHEELS_Y = [36, 186];

export const elementLabels: Record<DamageElement, string> = {
  bumperFront: "Pare-choc avant",
  hood: "Capot",
  windshield: "Pare-brise",
  roof: "Toit",
  rearWindow: "Lunette arrière",
  trunk: "Coffre",
  bumperRear: "Pare-choc arrière",
  fenderFrontLeft: "Aile avant gauche",
  doorFrontLeft: "Porte avant gauche",
  windowFrontLeft: "Vitre avant gauche",
  windowRearLeft: "Vitre arrière gauche",
  doorRearLeft: "Porte arrière gauche",
  fenderRearLeft: "Aile arrière gauche",
  rockerPanelLeft: "Bas de caisse gauche",
  fenderFrontRight: "Aile avant droite",
  doorFrontRight: "Porte avant droite",
  windowFrontRight: "Vitre avant droite",
  windowRearRight: "Vitre arrière droite",
  doorRearRight: "Porte arrière droite",
  fenderRearRight: "Aile arrière droite",
  rockerPanelRight: "Bas de caisse droit",
};

export const damageRowLabels: Record<DamageRow, string> = {
  top: "haut",
  middle: "milieu",
  bottom: "bas",
};

export const damageColLabels: Record<DamageCol, string> = {
  left: "gauche",
  center: "milieu",
  right: "droite",
};

export const damageTypeLabels: Record<DamageType, string> = {
  scratch: "Rayure",
  dent: "Enfoncement",
  broken: "Bris",
  missing: "Manquant",
};

export const DAMAGE_ROWS: DamageRow[] = ["top", "middle", "bottom"];
export const DAMAGE_COLS: DamageCol[] = ["left", "center", "right"];
export const DAMAGE_TYPES: DamageType[] = ["scratch", "dent", "broken", "missing"];

/** Les éléments vitrés, dessinés avec un fond distinct. */
export function isGlass(element: DamageElement): boolean {
  return element.startsWith("window") || element === "windshield" || element === "rearWindow";
}

/** « bas gauche », « milieu » — la case en clair, comme sur le contrat. */
export function damageLocationLabel(row: DamageRow, col: DamageCol): string {
  const r = damageRowLabels[row];
  const c = damageColLabels[col];
  return r === c ? r : `${r} ${c}`;
}

/**
 * Centre de la case (ligne, colonne) d'un élément, dans le repère 100 × 240.
 * Même calcul que le service PDF, pour que marqueur écran et marqueur imprimé
 * tombent au même endroit.
 *
 * `radius` borne le point à l'intérieur de la zone : le bas de caisse ne fait que
 * 7 unités de large, à peine plus que le marqueur, et sans bornage le cercle
 * chevauchait le contour de la caisse — on le lisait comme un dégât hors du
 * véhicule. Une zone plus étroite que le marqueur est centrée, faute de mieux.
 */
export function cellCenter(
  element: DamageElement,
  row: DamageRow,
  col: DamageCol,
  radius = 0
): { x: number; y: number } {
  const [zx, zy, zw, zh] = ZONES[element];
  const ci = DAMAGE_COLS.indexOf(col);
  const ri = DAMAGE_ROWS.indexOf(row);
  const x = zx + ((ci < 0 ? 1 : ci) + 0.5) * (zw / 3);
  const y = zy + ((ri < 0 ? 1 : ri) + 0.5) * (zh / 3);
  const clamp = (v: number, lo: number, hi: number, mid: number) =>
    hi < lo ? mid : Math.min(Math.max(v, lo), hi);
  return {
    x: clamp(x, zx + radius, zx + zw - radius, zx + zw / 2),
    y: clamp(y, zy + radius, zy + zh - radius, zy + zh / 2),
  };
}
