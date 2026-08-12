/** Unique mapping: API codes (English) to French display labels. */

export const appointmentStatusLabels: Record<string, string> = {
  quoteToDo: "Devis à faire",
  orderToPlace: "Commande à passer",
  partsReceived: "Pièces reçues",
};

export const appointmentCategoryLabels: Record<string, string> = {
  mechanic: "Mécanique",
  bodywork: "Carrosserie",
};

export const clientTypeLabels: Record<string, string> = {
  individual: "Particulier",
  company: "Société",
};

export const employeeCategoryLabels: Record<string, string> = {
  mechanic: "Mécanique",
  bodywork: "Carrosserie",
  office: "Bureau",
  director: "Dirigeant",
};

export const leaveRequestStatusLabels: Record<string, string> = {
  pending: "En attente",
  approved: "Validé",
  cancelled: "Annulé",
};

export const billTypeLabels: Record<string, string> = {
  OR: "Ordre de réparation",
  Dev: "Devis",
  Fact: "Facture",
};

export const billStatusLabels: Record<string, string> = {
  pause: "Pause",
  annule: "Annulé",
  edite: "Édité",
  comptabilise: "Comptabilisé",
};

// --- Module Facturation (codes EN -> libellés FR) ---

export const documentTypeLabels: Record<string, string> = {
  repairOrder: "Ordre de réparation",
  quote: "Devis",
  quoteAmendment: "Avenant",
  counterSale: "Vente directe",
};

// Libellés courts utilisés dans la liste unifiée /facturation (colonne Type).
export const billingDocKindLabels: Record<string, string> = {
  repairOrder: "OR",
  quote: "Devis",
  quoteAmendment: "Avenant",
  counterSale: "Vente",
  invoice: "Facture",
  creditNote: "Avoir",
};

export const documentStatusLabels: Record<string, string> = {
  draft: "Brouillon",
  issued: "Émis",
  signed: "Signé",
  refused: "Refusé",
  expired: "Expiré",
  obsolete: "Obsolète",
};

export const invoicePaymentStatusLabels: Record<string, string> = {
  unpaid: "Impayée",
  partiallyPaid: "Partiellement payée",
  paid: "Payée",
};

export const paymentMethodLabels: Record<string, string> = {
  cash: "Espèces",
  card: "Carte",
  wireTransfer: "Virement",
  check: "Chèque",
  sepaDebit: "Prélèvement SEPA",
  other: "Autre",
};

export const refundMethodLabels: Record<string, string> = {
  commercialCredit: "Avoir commercial",
  wireTransferRefund: "Remboursement par virement",
  cashRefund: "Remboursement en espèces",
  other: "Autre",
};

export const signatureMethodLabels: Record<string, string> = {
  paperScanned: "Papier scanné",
  tabletSignature: "Signature tablette",
  emailValidation: "Validation email",
  smsCode: "Code SMS",
  recordedVerbal: "Accord verbal enregistré",
};

export const unitCodeLabels: Record<string, string> = {
  hour: "heure",
  liter: "litre",
  kilogram: "kg",
  unit: "unité",
};

export const vatCategoryLabels: Record<string, string> = {
  S: "Taux normal",
  Z: "Taux zéro",
  E: "Exonéré",
  AE: "Autoliquidation",
  K: "Intracom. exonéré",
  G: "Export exonéré",
  O: "Hors champ TVA",
};

export function getLabel(map: Record<string, string>, code: string | undefined | null): string {
  if (code == null) return "";
  return map[code] ?? code;
}
