"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { refundMethodLabels, getLabel } from "@/lib/labels";

type CreditNote = {
  id: number;
  creditNoteNumber: string;
  sourceInvoiceId: number;
  issuedAt: string;
  reason: string;
  refundMethod: string;
  clientName: string | null;
  clientFirstName: string | null;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AvoirsPage() {
  const [avoirs, setAvoirs] = useState<CreditNote[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    fetch(`/api/proxy/creditNotes${qs}`)
      .then((r) => r.json())
      .then((d) => setAvoirs(Array.isArray(d) ? d : []))
      .catch(() => setAvoirs([]))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <>
      <PageHeader title="Avoirs" description="Tous les avoirs émis" />
      <PageBody>
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="N° avoir, client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Chargement…</div>
        ) : avoirs.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Aucun avoir"
            description="Les avoirs émis depuis les factures apparaissent ici."
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° avoir</TableHead>
                  <TableHead>Réf. facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {avoirs.map((cn, idx) => {
                  const clientLabel = [cn.clientName?.toUpperCase(), cn.clientFirstName].filter(Boolean).join(" ") || "—";
                  return (
                    <TableRow key={cn.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                      <TableCell className="font-mono text-sm font-medium">{cn.creditNoteNumber}</TableCell>
                      <TableCell>
                        <Link href={`/facturation/factures/${cn.sourceInvoiceId}`} className="text-sm text-primary hover:underline">
                          Facture #{cn.sourceInvoiceId}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{clientLabel}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(cn.issuedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
                          {getLabel(refundMethodLabels, cn.refundMethod)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{eur(cn.totalTtc)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/facturation/avoirs/${cn.id}`} aria-label="Voir avoir">
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
