"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { Pager, type Page } from "@/components/ui/pager";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { useDebouncedEffect } from "@/lib/use-debounced-effect";
import ClientModal from "./ClientModal";
import ClientFormModal from "./ClientFormModal";

export type Client = {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  city?: string;
  postalCode?: string;
  clientType: string;
};

type SortKey = "name" | "city" | "phone" | "email";
// Colonne de tri de l'écran → colonne de l'API. « Nom / Prénom » trie sur le nom,
// l'API ajoute le prénom en second critère.
const SORT_COLUMN: Record<SortKey, string> = {
  name: "lastName",
  city: "city",
  phone: "phone",
  email: "email",
};

export const CLIENTS_PAGE_SIZE = 50;

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return order === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

/**
 * La liste était rendue ENTIÈRE — 1 136 lignes, 334 Ko — puis filtrée et triée
 * dans le navigateur. Elle est maintenant paginée, filtrée et triée par l'API :
 * la première page arrive avec la page, les suivantes et les recherches passent
 * par le proxy. La recherche attend 250 ms après la dernière frappe.
 */
export default function ClientsList({
  initialPage,
  erreur = false,
}: {
  initialPage: Page<Client>;
  erreur?: boolean;
}) {
  const [items, setItems] = useState<Client[]>(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CLIENTS_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);

  // Une réponse arrivée après une demande plus récente est ignorée.
  const seq = useRef(0);
  const charger = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    const params = new URLSearchParams({
      sortBy: SORT_COLUMN[sortBy],
      order,
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/proxy/clients?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Page<Client> | null) => {
        if (mine !== seq.current) return;
        if (data && Array.isArray(data.items)) {
          setItems(data.items);
          setTotal(data.total);
        }
        setLoading(false);
      })
      .catch(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [search, sortBy, order, page, pageSize]);

  useDebouncedEffect(charger, [search], 250);
  useDebouncedEffect(charger, [sortBy, order, page, pageSize], 0);

  function handleSort(key: SortKey) {
    if (sortBy === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setOrder("asc");
    }
    setPage(1);
  }

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => handleSort(sortKey)}>
      <span className="inline-flex items-center gap-1.5">
        {label}
        <SortIcon active={sortBy === sortKey} order={order} />
      </span>
    </TableHead>
  );

  const vide = !loading && total === 0;

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${total} client${total > 1 ? "s" : ""}${search.trim() ? " trouvé" : " enregistré"}${total > 1 ? "s" : ""}`}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Nom, ville, téléphone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        }
        actions={
          <Button onClick={() => setNewClientOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau client
          </Button>
        }
      />
      <PageBody>
        {erreur ? (
          <LoadError quoi="La liste des clients" />
        ) : vide ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={search ? "Aucun résultat" : "Aucun client"}
            description={search ? "Modifiez votre recherche." : "Créez votre premier client."}
            action={
              !search && (
                <Button onClick={() => setNewClientOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nouveau client
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Nom / Prénom" sortKey="name" />
                    <SortHeader label="Ville" sortKey="city" />
                    <SortHeader label="Téléphone" sortKey="phone" />
                    <SortHeader label="Email" sortKey="email" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c, idx) => (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                      onClick={() => setSelectedClientId(c.id)}
                    >
                      <TableCell className="font-medium">{c.lastName} {c.firstName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.city ?? <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {c.phone ?? <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email ?? <span className="opacity-50">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </>
        )}
      </PageBody>

      <ClientModal
        clientId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
      />

      <ClientFormModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSaved={(data) => {
          // En tête de la page courante, sans rechargement : la fiche vient
          // d'être créée, elle est ce que l'on cherche à voir.
          setItems((prev) => [data as Client, ...prev]);
          setTotal((t) => t + 1);
          setNewClientOpen(false);
        }}
      />
    </>
  );
}
