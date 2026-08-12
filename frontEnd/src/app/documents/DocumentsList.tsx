"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, EyeOff, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { getLabel, billStatusLabels } from "@/lib/labels";
import type { BillListItem } from "./page";

type SortKey = "docNum" | "dateDoc" | "licensePlate" | "vehicleModel" | "client" | "type" | "status";

function formatDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function clientLabel(bill: BillListItem): string {
  return [bill.clientLastName, bill.clientFirstName].filter(Boolean).join(" ");
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

export default function DocumentsList({ initialBills }: { initialBills: BillListItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showAll, setShowAll] = useState(() => searchParams.get("showAll") === "1");
  const [filters, setFilters] = useState({
    docNum: searchParams.get("docNum") ?? "",
    dateDoc: searchParams.get("dateDoc") ?? "",
    licensePlate: searchParams.get("licensePlate") ?? "",
    vehicleModel: searchParams.get("vehicleModel") ?? "",
    client: searchParams.get("client") ?? "",
    type: searchParams.get("type") ?? "",
    status: searchParams.get("status") ?? "",
  });
  const [sortBy, setSortBy] = useState<SortKey>(() => (searchParams.get("sortBy") as SortKey) || "dateDoc");
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
    if (filters.docNum) params.set("docNum", filters.docNum);
    if (filters.dateDoc) params.set("dateDoc", filters.dateDoc);
    if (filters.licensePlate) params.set("licensePlate", filters.licensePlate);
    if (filters.vehicleModel) params.set("vehicleModel", filters.vehicleModel);
    if (filters.client) params.set("client", filters.client);
    if (filters.type) params.set("type", filters.type);
    if (filters.status) params.set("status", filters.status);
    if (sortBy !== "dateDoc") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (pageSize !== 20) params.set("pageSize", String(pageSize));
    if (page !== 1) params.set("page", String(page));
    if (showAll) params.set("showAll", "1");
    const qs = params.toString();
    const url = `${pathname}${qs ? `?${qs}` : ""}`;
    router.replace(url, { scroll: false });
    sessionStorage.setItem("documentsBackUrl", url);
  }, [filters, sortBy, sortOrder, pageSize, page, showAll, pathname, router]);

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
    return initialBills.filter((b) => {
      if (!showAll && (b.status === "annule" || b.type === "notFound" || b.type === "Acpt")) return false;

      const docNum = String(b.docNum ?? "");
      const date = b.dateDoc ?? "";
      const plate = (b.vehicleLicensePlate ?? "").toLowerCase();
      const model = [b.vehicleBrand, b.vehicleModel].filter(Boolean).join(" ").toLowerCase();
      const client = clientLabel(b).toLowerCase();
      const type = (b.type ?? "").toLowerCase();
      const status = (b.status ?? "").toLowerCase();

      if (filters.docNum && !docNum.includes(filters.docNum)) return false;
      if (filters.dateDoc && !date.includes(filters.dateDoc) && !formatDate(b.dateDoc).includes(filters.dateDoc)) return false;
      if (filters.licensePlate && !plate.includes(filters.licensePlate.toLowerCase())) return false;
      if (filters.vehicleModel && !model.includes(filters.vehicleModel.toLowerCase())) return false;
      if (filters.client && !client.includes(filters.client.toLowerCase())) return false;
      if (filters.type && !type.includes(filters.type.toLowerCase())) return false;
      if (filters.status && !status.includes(filters.status.toLowerCase())) return false;
      return true;
    });
  }, [initialBills, filters, showAll]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "docNum") {
        cmp = (a.docNum ?? 0) - (b.docNum ?? 0);
      } else if (sortBy === "dateDoc") {
        cmp = (a.dateDoc ?? "").localeCompare(b.dateDoc ?? "");
      } else if (sortBy === "licensePlate") {
        cmp = (a.vehicleLicensePlate ?? "").localeCompare(b.vehicleLicensePlate ?? "");
      } else if (sortBy === "vehicleModel") {
        const labelA = [a.vehicleBrand, a.vehicleModel].filter(Boolean).join(" ");
        const labelB = [b.vehicleBrand, b.vehicleModel].filter(Boolean).join(" ");
        cmp = labelA.localeCompare(labelB);
      } else if (sortBy === "client") {
        cmp = clientLabel(a).localeCompare(clientLabel(b));
      } else if (sortBy === "type") {
        cmp = (a.type ?? "").localeCompare(b.type ?? "");
      } else if (sortBy === "status") {
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
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

  const emptyFilters = { docNum: "", dateDoc: "", licensePlate: "", vehicleModel: "", client: "", type: "", status: "" };
  const hasFilters = Object.values(filters).some((v) => v !== "");

  const hiddenCount = initialBills.filter((b) => b.status === "annule" || b.type === "notFound" || b.type === "Acpt").length;

  return (
    <>
      <PageHeader
        title="Documents"
        description={`${sorted.length} document${sorted.length > 1 ? "s" : ""}${filtered.length < initialBills.length ? ` sur ${initialBills.length}` : ""}`}
        actions={
          hiddenCount > 0 ? (
            <button
              onClick={() => setShowAll((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                showAll
                  ? "bg-muted text-foreground border-border hover:bg-muted/70"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {showAll ? (
                <><EyeOff className="h-4 w-4" /> Masquer</>
              ) : (
                <><Eye className="h-4 w-4" /> Afficher tout ({hiddenCount})</>
              )}
            </button>
          ) : undefined
        }
      />
      <PageBody>
        {initialBills.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Aucun document"
            description="Aucun dossier enregistré."
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHeader label="N° doc" sortKey="docNum" className="w-20" />
                    <SortHeader label="Date" sortKey="dateDoc" className="w-32" />
                    <SortHeader label="Immat" sortKey="licensePlate" className="w-[136px]" />
                    <SortHeader label="Marque" sortKey="vehicleModel" className="w-[280px]" />
                    <SortHeader label="Client" sortKey="client" />
                    <SortHeader label="Type" sortKey="type" className="w-[88px]" />
                    <SortHeader label="Statut" sortKey="status" className="w-[136px]" />
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20 border-b">
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.docNum}
                        onChange={(e) => setFilter("docNum", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.dateDoc}
                        onChange={(e) => setFilter("dateDoc", e.target.value)}
                        placeholder="JJ/MM/AAAA"
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.licensePlate}
                        onChange={(e) => setFilter("licensePlate", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.vehicleModel}
                        onChange={(e) => setFilter("vehicleModel", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.client}
                        onChange={(e) => setFilter("client", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.type}
                        onChange={(e) => setFilter("type", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                    <TableHead className="py-1.5 px-3">
                      <Input
                        value={filters.status}
                        onChange={(e) => setFilter("status", e.target.value)}
                        placeholder="Filtrer..."
                        className="h-7 text-xs font-normal"
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                    paginated.map((bill, idx) => (
                      <TableRow
                        key={bill.id}
                        className={`h-11 cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                        onClick={() => router.push(`/documents/${bill.id}`)}
                      >
                        <TableCell className="tabular-nums font-medium overflow-hidden">
                          <span className="truncate block">{bill.docNum ?? <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground overflow-hidden">
                          <span className="truncate block">{formatDate(bill.dateDoc) || <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm overflow-hidden">
                          <span className="truncate block">{bill.vehicleLicensePlate || <span className="opacity-40 text-muted-foreground">—</span>}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground overflow-hidden">
                          <span className="truncate block">{[bill.vehicleBrand, bill.vehicleModel].filter(Boolean).join(" ") || <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="overflow-hidden">
                          <span className="truncate block">{clientLabel(bill) || <span className="opacity-40 text-muted-foreground">—</span>}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-sm overflow-hidden">
                          <span className="truncate block">{bill.type || <span className="opacity-40">—</span>}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground overflow-hidden">
                          <span className="truncate block">{getLabel(billStatusLabels, bill.status) || bill.status || <span className="opacity-40">—</span>}</span>
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
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent"
                  aria-label="Première page"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent"
                  aria-label="Page précédente"
                >
                  ‹
                </button>
                <span className="px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent"
                  aria-label="Page suivante"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent"
                  aria-label="Dernière page"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
