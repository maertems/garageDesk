"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, FileText, EyeOff, Eye, Loader2 } from "lucide-react";
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
import { Pager } from "@/components/ui/pager";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { getLabel, billStatusLabels } from "@/lib/labels";
import { useDebouncedEffect } from "@/lib/use-debounced-effect";
import type { BillListItem, BillPage } from "./page";

type SortKey = "docNum" | "dateDoc" | "licensePlate" | "vehicleModel" | "client" | "type" | "status";
type Filters = Record<"docNum" | "dateDoc" | "licensePlate" | "vehicleModel" | "client" | "type" | "status", string>;

const EMPTY_FILTERS: Filters = { docNum: "", dateDoc: "", licensePlate: "", vehicleModel: "", client: "", type: "", status: "" };
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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

/**
 * Paramètres de la liste tels qu'ils voyagent dans l'URL de la page ET vers
 * l'API : mêmes noms, mêmes valeurs. `page.tsx` les lit pour rendre la première
 * page côté serveur, la liste les relit pour reprendre là où l'on était.
 */
export type DocumentsQuery = {
  filters: Filters;
  sortBy: SortKey;
  sortOrder: "asc" | "desc";
  pageSize: number;
  page: number;
  showAll: boolean;
};

export function lireQuery(get: (k: string) => string | null): DocumentsQuery {
  return {
    filters: {
      docNum: get("docNum") ?? "",
      dateDoc: get("dateDoc") ?? "",
      licensePlate: get("licensePlate") ?? "",
      vehicleModel: get("vehicleModel") ?? "",
      client: get("client") ?? "",
      type: get("type") ?? "",
      status: get("status") ?? "",
    },
    sortBy: (get("sortBy") as SortKey) || "dateDoc",
    sortOrder: (get("sortOrder") as "asc" | "desc") || "desc",
    pageSize: Number(get("pageSize")) || DEFAULT_PAGE_SIZE,
    page: Number(get("page")) || 1,
    showAll: get("showAll") === "1",
  };
}

/** Chaîne de requête de l'API pour une page donnée. */
export function apiQuery(q: DocumentsQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q.filters)) if (v) p.set(k, v);
  p.set("sortBy", q.sortBy);
  p.set("order", q.sortOrder);
  if (q.showAll) p.set("showAll", "true");
  p.set("limit", String(q.pageSize));
  p.set("offset", String((q.page - 1) * q.pageSize));
  return p.toString();
}

/**
 * La liste des documents était rendue avec ses 5 125 lignes — 1,5 Mo — pour en
 * afficher vingt, et filtrait, triait et paginait dans le navigateur. Tout cela
 * est fait par l'API : la page arrive garnie de sa première page, et chaque
 * filtre, tri ou changement de page demande la sienne. Les filtres de colonne
 * attendent 250 ms après la dernière frappe.
 */
export default function DocumentsList({ initialPage }: { initialPage: BillPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initial = lireQuery((k) => searchParams.get(k));
  const [showAll, setShowAll] = useState(initial.showAll);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [sortBy, setSortBy] = useState<SortKey>(initial.sortBy);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initial.sortOrder);
  const [pageSize, setPageSize] = useState(initial.pageSize);
  const [page, setPage] = useState(initial.page);

  const [items, setItems] = useState<BillListItem[]>(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [totalAll, setTotalAll] = useState(initialPage.totalAll);
  const [hiddenCount, setHiddenCount] = useState(initialPage.hiddenCount);
  const [loading, setLoading] = useState(false);

  // L'URL suit l'état, pour revenir à la même page depuis une fiche.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (sortBy !== "dateDoc") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
    if (page !== 1) params.set("page", String(page));
    if (showAll) params.set("showAll", "1");
    const qs = params.toString();
    const url = `${pathname}${qs ? `?${qs}` : ""}`;
    router.replace(url, { scroll: false });
    sessionStorage.setItem("documentsBackUrl", url);
  }, [filters, sortBy, sortOrder, pageSize, page, showAll, pathname, router]);

  // Une réponse arrivée après une demande plus récente est ignorée.
  const seq = useRef(0);
  const charger = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    fetch(`/api/proxy/bills?${apiQuery({ filters, sortBy, sortOrder, pageSize, page, showAll })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BillPage | null) => {
        if (mine !== seq.current) return;
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          setTotal(data.total);
          setTotalAll(data.totalAll);
          setHiddenCount(data.hiddenCount);
        }
        setLoading(false);
      })
      .catch(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [filters, sortBy, sortOrder, pageSize, page, showAll]);

  useDebouncedEffect(charger, [filters], 250);
  useDebouncedEffect(charger, [sortBy, sortOrder, pageSize, page, showAll], 0);

  function setFilter(key: keyof Filters, value: string) {
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

  const FilterCell = ({ name, placeholder = "Filtrer..." }: { name: keyof Filters; placeholder?: string }) => (
    <TableHead className="py-1.5 px-3">
      <Input
        value={filters[name]}
        onChange={(e) => setFilter(name, e.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs font-normal"
      />
    </TableHead>
  );

  const hasFilters = Object.values(filters).some((v) => v !== "");

  return (
    <>
      <PageHeader
        title="Documents"
        description={`${total} document${total > 1 ? "s" : ""}${total < totalAll ? ` sur ${totalAll}` : ""}`}
        actions={
          <div className="flex items-center gap-3">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />}
            {hiddenCount > 0 && (
              <button
                onClick={() => {
                  setShowAll((v) => !v);
                  setPage(1);
                }}
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
            )}
          </div>
        }
      />
      <PageBody>
        {totalAll === 0 ? (
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
                    <FilterCell name="docNum" />
                    <FilterCell name="dateDoc" placeholder="JJ/MM/AAAA" />
                    <FilterCell name="licensePlate" />
                    <FilterCell name="vehicleModel" />
                    <FilterCell name="client" />
                    <FilterCell name="type" />
                    <FilterCell name="status" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        {loading ? "Chargement…" : "Aucun résultat"}
                        {!loading && hasFilters && (
                          <button
                            onClick={() => {
                              setFilters(EMPTY_FILTERS);
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
                    items.map((bill, idx) => (
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

            <Pager
              page={page}
              pageSize={pageSize}
              total={total}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </>
        )}
      </PageBody>
    </>
  );
}
