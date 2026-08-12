"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { invoicePaymentStatusLabels, getLabel } from "@/lib/labels";

type Invoice = {
  id: number;
  uuid: string;
  invoiceNumber: string;
  sourceQuoteId: number;
  issuedAt: string;
  serviceDate: string | null;
  clientName: string | null;
  clientFirstName: string | null;
  vehicleLicensePlate: string | null;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  paymentStatus: string;
  amountPaid: number;
  createdAt: string;
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid:        "border-red-300 text-red-700 bg-red-50",
  partiallyPaid: "border-yellow-300 text-yellow-700 bg-yellow-50",
  paid:          "border-green-300 text-green-700 bg-green-50",
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const PAYMENT_STATUSES = ["", "unpaid", "partiallyPaid", "paid"];

export default function FacturesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    const qs = params.toString();
    fetch(`/api/proxy/invoices${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d) => setInvoices(Array.isArray(d) ? d : []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [search, paymentStatus]);

  return (
    <>
      <PageHeader
        title="Factures"
        description="Récapitulatif de toutes les factures émises"
      />
      <PageBody>
        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="N° facture, client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Statut paiement" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {PAYMENT_STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{getLabel(invoicePaymentStatusLabels, s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Chargement…</div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Aucune facture"
            description="Les factures émises depuis les dossiers apparaissent ici."
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total HT</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead>Paiement</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv, idx) => {
                  const clientLabel = [inv.clientName?.toUpperCase(), inv.clientFirstName].filter(Boolean).join(" ") || "—";
                  return (
                    <TableRow key={inv.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                      <TableCell className="font-mono text-sm font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{clientLabel}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{inv.vehicleLicensePlate ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(inv.issuedAt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{eur(inv.totalHt)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{eur(inv.totalTtc)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[inv.paymentStatus] ?? ""}`}>
                          {getLabel(invoicePaymentStatusLabels, inv.paymentStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/facturation/factures/${inv.id}`} aria-label="Voir facture">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </>
  );
}
