"use client";

import { useState, useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, Users } from "lucide-react";
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
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import ClientModal from "./ClientModal";
import ClientFormModal from "./ClientFormModal";

type Client = {
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

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return order === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

export default function ClientsList({
  initialClients,
  erreur = false,
}: {
  initialClients: Client[];
  erreur?: boolean;
}) {
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase().trim();
    return clients.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const city = (c.city ?? "").toLowerCase();
      const postal = (c.postalCode ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const email = (c.email ?? "").toLowerCase();
      return (
        name.includes(q) ||
        city.includes(q) ||
        postal.includes(q) ||
        phone.includes(q) ||
        email.includes(q)
      );
    });
  }, [clients, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = (a.lastName + " " + a.firstName).localeCompare(b.lastName + " " + b.firstName);
      } else if (sortBy === "city") {
        cmp = (a.city ?? "").localeCompare(b.city ?? "");
      } else if (sortBy === "phone") {
        cmp = (a.phone ?? "").localeCompare(b.phone ?? "");
      } else if (sortBy === "email") {
        cmp = (a.email ?? "").localeCompare(b.email ?? "");
      }
      return order === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortBy, order]);

  function handleSort(key: SortKey) {
    setSortBy((prev) => {
      if (prev === key) {
        setOrder((o) => (o === "asc" ? "desc" : "asc"));
        return key;
      }
      setOrder("asc");
      return key;
    });
  }

  const SortHeader = ({ label, sortKey }: { label: string; sortKey: SortKey }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => handleSort(sortKey)}>
      <span className="inline-flex items-center gap-1.5">
        {label}
        <SortIcon active={sortBy === sortKey} order={order} />
      </span>
    </TableHead>
  );

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} client${clients.length > 1 ? "s" : ""} enregistré${clients.length > 1 ? "s" : ""}`}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Nom, ville, téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
        ) : sorted.length === 0 ? (
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
                {sorted.map((c, idx) => (
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
          setClients((prev) => [data as Client, ...prev]);
          setNewClientOpen(false);
        }}
      />
    </>
  );
}
