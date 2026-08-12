"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, X, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoicePaymentStatusLabels, paymentMethodLabels, unitCodeLabels, getLabel } from "@/lib/labels";
import PaymentModal from "./PaymentModal";
import CreditNoteModal from "./CreditNoteModal";

type InvoiceLine = {
  id: number;
  lineNumber: number;
  lineType: string | null;
  label: string;
  longDescription: string | null;
  quantity: number;
  unitCode: string | null;
  unitPriceHt: number;
  discountPercent: number;
  vatRate: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  sourceQuoteId: number;
  sourceQuoteNumber: string | null;
  issuedAt: string;
  serviceDate: string | null;
  issuerName: string | null;
  issuerSiren: string | null;
  issuerSiret: string | null;
  issuerRcsCity: string | null;
  issuerVatIntracom: string | null;
  issuerAddressLine1: string | null;
  issuerPostalCode: string | null;
  issuerCity: string | null;
  issuerIban: string | null;
  issuerBic: string | null;
  clientName: string | null;
  clientFirstName: string | null;
  clientAddressLine1: string | null;
  clientPostalCode: string | null;
  clientCity: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  vehicleLicensePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleKilometrage: number | null;
  subtotalHt: number;
  globalDiscountPercent: number;
  globalDiscountAmount: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  paymentStatus: string;
  amountPaid: number;
  paymentTerms: string | null;
  paymentDueDate: string | null;
  mediatorNotice: string | null;
  vatExemptionNotice: string | null;
  legalWarrantyNotice: string | null;
  lines: InvoiceLine[];
};

type Payment = {
  id: number;
  invoiceId: number;
  paidAt: string | null;
  amount: number;
  paymentMethod: string;
  reference: string | null;
  isCancelled: boolean;
  cancellationReason: string | null;
  createdAt: string;
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid:        "border-red-300 text-red-700 bg-red-50",
  partiallyPaid: "border-yellow-300 text-yellow-700 bg-yellow-50",
  paid:          "border-green-300 text-green-700 bg-green-50",
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const pct = (n: number) => `${Number(n).toFixed(2).replace(".", ",")} %`;

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InfoBlock({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default function FactureDetail({ invoice: initialInv }: { invoice: Invoice }) {
  const [inv, setInv] = useState<Invoice>(initialInv);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentModal, setPaymentModal] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [cnModal, setCnModal] = useState(false);

  const clientLabel = [inv.clientName?.toUpperCase(), inv.clientFirstName].filter(Boolean).join(" ") || "—";
  const vehicleLabel = [inv.vehicleLicensePlate, inv.vehicleMake, inv.vehicleModel].filter(Boolean).join(" — ") || "—";
  const amountRemaining = Math.max(0, inv.totalTtc - inv.amountPaid);

  async function refreshInvoiceAndPayments() {
    const [ri, rp] = await Promise.all([
      fetch(`/api/proxy/invoices/${inv.id}`),
      fetch(`/api/proxy/payments?invoiceId=${inv.id}`),
    ]);
    if (ri.ok) setInv(await ri.json());
    if (rp.ok) setPayments(await rp.json());
  }

  useEffect(() => {
    refreshInvoiceAndPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCancelPayment(p: Payment) {
    if (!confirm(`Annuler le paiement de ${eur(p.amount)} ?`)) return;
    setCancelling(p.id);
    await fetch(`/api/proxy/payments/${p.id}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await refreshInvoiceAndPayments();
    setCancelling(null);
  }

  return (
    <>
      <PageHeader
        title={inv.invoiceNumber}
        description={`${clientLabel} — ${vehicleLabel}`}
        back={{ href: "/facturation/factures", label: "Factures" }}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-sm ${PAYMENT_STATUS_COLORS[inv.paymentStatus] ?? ""}`}>
              {getLabel(invoicePaymentStatusLabels, inv.paymentStatus)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setCnModal(true)}
              className="border-red-300 text-red-700 hover:bg-red-50">
              Créer un avoir
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/proxy/invoices/${inv.id}/pdf`} download={`${inv.invoiceNumber}.pdf`}>
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/facturation/documents/${inv.sourceQuoteId}`}>
                Voir le devis{inv.sourceQuoteNumber ? ` ${inv.sourceQuoteNumber}` : ""}
              </Link>
            </Button>
          </div>
        }
      />
      <PageBody>
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date d'émission</p>
            <p className="font-medium">{formatDate(inv.issuedAt)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total TTC</p>
            <p className="text-xl font-bold tabular-nums">{eur(inv.totalTtc)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Payé</p>
            <p className="font-medium tabular-nums text-green-700">{eur(inv.amountPaid)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Reste à payer</p>
            <p className={`font-bold tabular-nums ${amountRemaining > 0 ? "text-red-700" : "text-green-700"}`}>
              {eur(amountRemaining)}
            </p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          {/* Émetteur */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Émetteur</p>
            <InfoBlock label="Raison sociale" value={inv.issuerName} />
            <InfoBlock label="SIREN" value={inv.issuerSiren} />
            <InfoBlock label="SIRET" value={inv.issuerSiret} />
            <InfoBlock label="RCS" value={inv.issuerRcsCity} />
            <InfoBlock label="TVA Intracom." value={inv.issuerVatIntracom} />
            <InfoBlock label="Adresse" value={[inv.issuerAddressLine1, inv.issuerPostalCode, inv.issuerCity].filter(Boolean).join(", ")} />
            {inv.issuerIban && <InfoBlock label="IBAN" value={inv.issuerIban} />}
          </div>
          {/* Client */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Client</p>
            <InfoBlock label="Nom" value={clientLabel} />
            <InfoBlock label="Adresse" value={[inv.clientAddressLine1, inv.clientPostalCode, inv.clientCity].filter(Boolean).join(", ")} />
            <InfoBlock label="E-mail" value={inv.clientEmail} />
            <InfoBlock label="Téléphone" value={inv.clientPhone} />
            <InfoBlock label="Véhicule" value={vehicleLabel} />
            {inv.vehicleKilometrage != null && (
              <InfoBlock label="Kilométrage" value={`${inv.vehicleKilometrage.toLocaleString("fr-FR")} km`} />
            )}
          </div>
        </div>

        {/* Lines */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Lignes</h2>
        <div className="rounded-xl border bg-card overflow-hidden mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Désignation</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead>U.</TableHead>
                <TableHead className="text-right">P.U. HT</TableHead>
                <TableHead className="text-right">Remise</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">Total HT</TableHead>
                <TableHead className="text-right">Total TTC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Aucune ligne
                  </TableCell>
                </TableRow>
              ) : (
                inv.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-muted-foreground text-xs">{l.lineNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{l.label}</p>
                      {l.longDescription && (
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{l.longDescription}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{l.quantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{getLabel(unitCodeLabels, l.unitCode ?? "")}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{eur(l.unitPriceHt)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {l.discountPercent > 0 ? pct(l.discountPercent) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {pct(l.vatRate)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{eur(l.totalHt)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{eur(l.totalTtc)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sous-total HT</span>
              <span className="tabular-nums">{eur(inv.subtotalHt)}</span>
            </div>
            {inv.globalDiscountPercent > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Remise globale ({pct(inv.globalDiscountPercent)})</span>
                <span className="tabular-nums">−{eur(inv.globalDiscountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <span className="tabular-nums">{eur(inv.totalHt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total TVA</span>
              <span className="tabular-nums">{eur(inv.totalVat)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
              <span>Total TTC</span>
              <span className="tabular-nums">{eur(inv.totalTtc)}</span>
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Paiements</h2>
          {inv.paymentStatus !== "paid" && (
            <Button size="sm" onClick={() => setPaymentModal(true)}>
              <Plus className="h-4 w-4" />
              Ajouter paiement
            </Button>
          )}
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-6">Aucun paiement enregistré.</p>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden mb-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} className={p.isCancelled ? "opacity-50 line-through" : ""}>
                    <TableCell className="text-sm">{formatDate(p.paidAt)}</TableCell>
                    <TableCell className="text-sm">{getLabel(paymentMethodLabels, p.paymentMethod)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{eur(p.amount)}</TableCell>
                    <TableCell>
                      {p.isCancelled ? (
                        <Badge variant="outline" className="text-xs border-gray-300 text-gray-400">Annulé</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">Validé</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!p.isCancelled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={cancelling === p.id}
                          onClick={() => handleCancelPayment(p)}
                          aria-label="Annuler paiement"
                        >
                          <X className="h-4 w-4 text-destructive/70" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Payment info + mentions */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Paiement</p>
            <InfoBlock label="Statut" value={getLabel(invoicePaymentStatusLabels, inv.paymentStatus)} />
            {inv.paymentDueDate && <InfoBlock label="Échéance" value={formatDate(inv.paymentDueDate)} />}
            {inv.paymentTerms && <InfoBlock label="Conditions" value={inv.paymentTerms} />}
          </div>
          {(inv.mediatorNotice || inv.vatExemptionNotice || inv.legalWarrantyNotice) && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Mentions légales</p>
              {inv.vatExemptionNotice && (
                <p className="text-xs text-muted-foreground">{inv.vatExemptionNotice}</p>
              )}
              {inv.mediatorNotice && (
                <p className="text-xs text-muted-foreground">{inv.mediatorNotice}</p>
              )}
              {inv.legalWarrantyNotice && (
                <p className="text-xs text-muted-foreground">{inv.legalWarrantyNotice}</p>
              )}
            </div>
          )}
        </div>
      </PageBody>

      <PaymentModal
        open={paymentModal}
        onClose={() => setPaymentModal(false)}
        onSaved={() => { setPaymentModal(false); refreshInvoiceAndPayments(); }}
        invoiceId={inv.id}
        remainingAmount={amountRemaining}
      />

      <CreditNoteModal
        open={cnModal}
        onClose={() => setCnModal(false)}
        onSaved={(cnId) => { setCnModal(false); window.location.href = `/facturation/avoirs/${cnId}`; }}
        invoiceId={inv.id}
      />
    </>
  );
}
