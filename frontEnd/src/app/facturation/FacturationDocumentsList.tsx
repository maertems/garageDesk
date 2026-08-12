"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import {
  getLabel,
  billingDocKindLabels,
  documentStatusLabels,
  invoicePaymentStatusLabels,
} from "@/lib/labels";
import type { UnifiedDocRow } from "./page";

type SortKey = "number" | "parentRef" | "date" | "client" | "vehicle" | "type" | "status" | "totalTtc";

const DOC_STATUS_COLORS: Record<string, string> = {
  draft: "border-gray-300 text-gray-600 bg-gray-50",
  issued: "border-yellow-300 text-yellow-700 bg-yellow-50",
  signed: "border-green-300 text-green-700 bg-green-50",
  refused: "border-red-300 text-red-700 bg-red-50",
  expired: "border-orange-300 text-orange-700 bg-orange-50",
  obsolete: "border-gray-300 text-gray-400 bg-gray-50",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  unpaid: "border-red-300 text-red-700 bg-red-50",
  partiallyPaid: "border-yellow-300 text-yellow-700 bg-yellow-50",
  paid: "border-green-300 text-green-700 bg-green-50",
};

const CREDIT_NOTE_STATUS_COLOR = "border-red-200 text-red-700 bg-red-50";

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function clientLabel(row: UnifiedDocRow): string {
  return [row.clientLastName?.toUpperCase(), row.clientFirstName].filter(Boolean).join(" ");
}

function vehicleLabel(row: UnifiedDocRow): string {
  return [row.vehicleLicensePlate, row.vehicleBrand, row.vehicleModel].filter(Boolean).join(" — ");
}

function typeLabel(row: UnifiedDocRow): string {
  return getLabel(billingDocKindLabels, row.kind);
}

function statusLabel(row: UnifiedDocRow): string {
  if (row.kind === "creditNote") return "Émis";
  if (row.kind === "invoice") return getLabel(invoicePaymentStatusLabels, row.status ?? "");
  return getLabel(documentStatusLabels, row.status ?? "");
}

function statusColor(row: UnifiedDocRow): string {
  if (row.kind === "creditNote") return CREDIT_NOTE_STATUS_COLOR;
  if (row.kind === "invoice") return PAYMENT_STATUS_COLORS[row.status ?? ""] ?? "";
  return DOC_STATUS_COLORS[row.status ?? ""] ?? "";
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />;
  return order === "asc" ? (
    <ArrowUp className="h-3 w-3 shrink-0" />
  ) : (
    <ArrowDown className="h-3 w-3 shrink-0" />
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function FacturationDocumentsList({ initialRows }: { initialRows: UnifiedDocRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    number: searchParams.get("number") ?? "",
    parentRef: searchParams.get("parentRef") ?? "",
    date: searchParams.get("date") ?? "",
    client: searchParams.get("client") ?? "",
    vehicle: searchParams.get("vehicle") ?? "",
    type: searchParams.get("type") ?? "",
    status: searchParams.get("status") ?? "",
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => (searchParams.get("sortBy") as SortKey) || "date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() => (searchParams.get("sortOrder") as "asc" | "desc") || "desc");
  const [pageSize, setPageSize] = useState(() => Number(searchParams.get("pageSize")) || 20);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (filters.number) params.set("number", filters.number);
    if (filters.parentRef) params.set("parentRef", filters.parentRef);
    if (filters.date) params.set("date", filters.date);
    if (filters.client) params.set("client", filters.client);
    if (filters.vehicle) params.set("vehicle", filters.vehicle);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (sortBy !== "date") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (pageSize !== 20) params.set("pageSize", String(pageSize));
    if (page !== 1) params.set("page", String(page));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [filters, sortBy, sortOrder, pageSize, page, pathname, router]);

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    return initialRows.filter((row) => {
      const number = row.number.toLowerCase();
      const parentRef = (row.parentRef ?? "").toLowerCase();
      const date = formatDate(row.date).toLowerCase();
      const client = clientLabel(row).toLowerCase();
      const vehicle = vehicleLabel(row).toLowerCase();
      const type = typeLabel(row).toLowerCase();
      const status = statusLabel(row).toLowerCase();

      if (filters.number && !number.includes(filters.number.toLowerCase())) return false;
      if (filters.parentRef && !parentRef.includes(filters.parentRef.toLowerCase())) return false;
      if (filters.date && !date.includes(filters.date.toLowerCase())) return false;
      if (filters.client && !client.includes(filters.client.toLowerCase())) return false;
      if (filters.vehicle && !vehicle.includes(filters.vehicle.toLowerCase())) return false;
      if (filters.type && !type.includes(filters.type.toLowerCase())) return false;
      if (filters.status && !status.includes(filters.status.toLowerCase())) return false;
      return true;
    });
  }, [initialRows, filters]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "number") {
        cmp = a.number.localeCompare(b.number);
      } else if (sortBy === "parentRef") {
        cmp = (a.parentRef ?? "").localeCompare(b.parentRef ?? "");
      } else if (sortBy === "date") {
        cmp = a.date.localeCompare(b.date);
      } else if (sortBy === "client") {
        cmp = clientLabel(a).localeCompare(clientLabel(b));
      } else if (sortBy === "vehicle") {
        cmp = vehicleLabel(a).localeCompare(vehicleLabel(b));
      } else if (sortBy === "type") {
        cmp = typeLabel(a).localeCompare(typeLabel(b));
      } else if (sortBy === "status") {
        cmp = statusLabel(a).localeCompare(statusLabel(b));
      } else if (sortBy === "totalTtc") {
        cmp = a.totalTtc - b.totalTtc;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  const SortHeader = ({
    label,
    sortKey,
    className,
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer select-none ${className ?? ""}`}
      onClick={() => handleSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <SortIcon active={sortBy === sortKey} order={sortOrder} />
      </span>
    </TableHead>
  );

  const emptyFilters = { number: "", parentRef: "", date: "", client: "", vehicle: "", type: "", status: "" };
  const hasFilters = Object.values(filters).some((v) => v !== "");

  return (
    <>
      <PageHeader
        title="Documents"
        description={`${sorted.length} document${sorted.length > 1 ? "s" : ""}${filtered.length < initialRows.length ? ` sur ${initialRows.length}` : ""}`}
        actions={
          <Button asChild>
            <Link href="/facturation/documents/new">
              <Plus className="h-4 w-4" />
              Nouveau document
            </Link>
          </Button>
        }
      />
      <PageBody>
        {initialRows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Aucun document"
            description="Les OR, devis, avenants, ventes, factures et avoirs apparaîtront ici."
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHeader label="N° document" sortKey="number" className="w-32" />
                    <SortHeader label="Réf." sortKey="parentRef" className="w-28" />
                    <SortHeader label="Date" sortKey="date" className="w-28" />
                    <SortHeader label="Client" sortKey="client" />
                    <SortHeader label="Véhicule" sortKey="vehicle" className="w-56" />
                    <SortHeader label="Type" sortKey="type" className="w-24" />
                    <SortHeader label="Statut" sortKey="status" className="w-40" />
                    <SortHeader label="Total TTC" sortKey="totalTtc" className="w-28 text-right" />
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.number} onChange={(e) => setFilter("number", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.parentRef} onChange={(e) => setFilter("parentRef", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.date} onChange={(e) => setFilter("date", e.target.value)} placeholder="JJ/MM/AAAA" className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.client} onChange={(e) => setFilter("client", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.vehicle} onChange={(e) => setFilter("vehicle", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.type} onChange={(e) => setFilter("type", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input value={filters.status} onChange={(e) => setFilter("status", e.target.value)} placeholder="Filtrer..." className="h-7 text-xs font-normal" />
                    </TableHead>
                    <TableHead className="py-1.5 px-3" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        Aucun résultat
                        {hasFilters && (
                          <button
                            onClick={() => {
                              setFilters(emptyFilters);
                              setPage(1);
                            }}
                            className="ml-2 text-primary underline text-sm"
                          >
                            Effacer les filtres
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((row, idx) => (
                      <TableRow
                        key={row.key}
                        className={`h-11 cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                        onClick={() => router.push(row.href)}
                      >
                        <TableCell className="tabular-nums font-medium overflow-hidden">
                          <span className="truncate block">{row.number}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground overflow-hidden">
                          <span className="truncate block">{row.parentRef || <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground overflow-hidden">
                          <span className="truncate block">{formatDate(row.date)}</span>
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <span className="truncate block">{clientLabel(row) || <span className="opacity-40 text-muted-foreground">—</span>}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground overflow-hidden">
                          <span className="truncate block">{vehicleLabel(row) || <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <span className="truncate block text-xs font-medium">{typeLabel(row)}</span>
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <Badge variant="outline" className={`text-xs ${statusColor(row)}`}>
                            {statusLabel(row)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium overflow-hidden">
                          {eur(row.totalTtc)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Lignes par page :</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border rounded px-2 py-1 text-sm bg-background"
                >
                  {PAGE_SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="mr-2">
                  {sorted.length === 0
                    ? "0 résultat"
                    : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, sorted.length)} sur ${sorted.length}`}
                </span>
                <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent" aria-label="Première page">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent" aria-label="Page précédente">‹</button>
                <span className="px-2">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent" aria-label="Page suivante">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent" aria-label="Dernière page">»</button>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
