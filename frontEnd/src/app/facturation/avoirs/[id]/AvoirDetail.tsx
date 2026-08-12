"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { refundMethodLabels, unitCodeLabels, getLabel } from "@/lib/labels";

type CreditNoteLine = {
  id: number;
  lineNumber: number;
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

type CreditNote = {
  id: number;
  creditNoteNumber: string;
  sourceInvoiceId: number;
  issuedAt: string;
  reason: string;
  refundMethod: string;
  refundedAt: string | null;
  issuerName: string | null;
  issuerSiren: string | null;
  issuerSiret: string | null;
  issuerRcsCity: string | null;
  issuerVatIntracom: string | null;
  issuerAddressLine1: string | null;
  issuerPostalCode: string | null;
  issuerCity: string | null;
  clientName: string | null;
  clientFirstName: string | null;
  clientAddressLine1: string | null;
  clientPostalCode: string | null;
  clientCity: string | null;
  clientEmail: string | null;
  vehicleLicensePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  subtotalHt: number;
  globalDiscountPercent: number;
  globalDiscountAmount: number;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  mediatorNotice: string | null;
  vatExemptionNotice: string | null;
  legalWarrantyNotice: string | null;
  lines: CreditNoteLine[];
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const pct = (n: number) => `${Number(n).toFixed(2).replace(".", ",")} %`;

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function InfoBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default function AvoirDetail({ creditNote: cn }: { creditNote: CreditNote }) {
  const clientLabel = [cn.clientName?.toUpperCase(), cn.clientFirstName].filter(Boolean).join(" ") || "—";
  const vehicleLabel = [cn.vehicleLicensePlate, cn.vehicleMake, cn.vehicleModel].filter(Boolean).join(" — ") || "—";

  return (
    <>
      <PageHeader
        title={cn.creditNoteNumber}
        description={`${clientLabel} — ${vehicleLabel}`}
        back={{ href: "/facturation/avoirs", label: "Avoirs" }}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm border-red-300 text-red-700 bg-red-50">
              {getLabel(refundMethodLabels, cn.refundMethod)}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/proxy/creditNotes/${cn.id}/pdf`} download={`${cn.creditNoteNumber}.pdf`}>
                <Download className="h-4 w-4" />
                PDF
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/facturation/factures/${cn.sourceInvoiceId}`}>Facture d'origine</Link>
            </Button>
          </div>
        }
      />
      <PageBody>
        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date d'émission</p>
            <p className="font-medium">{formatDate(cn.issuedAt)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total TTC</p>
            <p className="text-xl font-bold tabular-nums text-red-700">{eur(cn.totalTtc)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Motif</p>
            <p className="text-sm font-medium line-clamp-2">{cn.reason}</p>
          </div>
        </div>

        {/* Parties */}
        <div className="grid gap-4 sm:grid-cols-2 mb-6">
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Émetteur</p>
            <InfoBlock label="Raison sociale" value={cn.issuerName} />
            <InfoBlock label="SIREN" value={cn.issuerSiren} />
            <InfoBlock label="SIRET" value={cn.issuerSiret} />
            <InfoBlock label="RCS" value={cn.issuerRcsCity} />
            <InfoBlock label="TVA Intracom." value={cn.issuerVatIntracom} />
            <InfoBlock label="Adresse" value={[cn.issuerAddressLine1, cn.issuerPostalCode, cn.issuerCity].filter(Boolean).join(", ")} />
          </div>
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Client</p>
            <InfoBlock label="Nom" value={clientLabel} />
            <InfoBlock label="Adresse" value={[cn.clientAddressLine1, cn.clientPostalCode, cn.clientCity].filter(Boolean).join(", ")} />
            <InfoBlock label="E-mail" value={cn.clientEmail} />
            <InfoBlock label="Véhicule" value={vehicleLabel} />
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
              {cn.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground text-xs">{l.lineNumber}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{l.label}</p>
                    {l.longDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5">{l.longDescription}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{l.quantity}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{getLabel(unitCodeLabels, l.unitCode ?? "")}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{eur(l.unitPriceHt)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {l.discountPercent > 0 ? pct(l.discountPercent) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{pct(l.vatRate)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{eur(l.totalHt)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-red-700">{eur(l.totalTtc)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sous-total HT</span>
              <span className="tabular-nums">{eur(cn.subtotalHt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total HT</span>
              <span className="tabular-nums">{eur(cn.totalHt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total TVA</span>
              <span className="tabular-nums">{eur(cn.totalVat)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1 text-red-700">
              <span>Total avoir TTC</span>
              <span className="tabular-nums">{eur(cn.totalTtc)}</span>
            </div>
          </div>
        </div>

        {/* Legal mentions */}
        {(cn.mediatorNotice || cn.vatExemptionNotice || cn.legalWarrantyNotice) && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Mentions légales</p>
            {cn.vatExemptionNotice && <p className="text-xs text-muted-foreground">{cn.vatExemptionNotice}</p>}
            {cn.mediatorNotice && <p className="text-xs text-muted-foreground mt-1">{cn.mediatorNotice}</p>}
            {cn.legalWarrantyNotice && <p className="text-xs text-muted-foreground mt-1">{cn.legalWarrantyNotice}</p>}
          </div>
        )}
      </PageBody>
    </>
  );
}
