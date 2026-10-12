"use client";

import { useState, useRef, useCallback } from "react";
import { Car, Loader2, Plus, Search } from "lucide-react";
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
import { VEHICLES_PAGE_SIZE } from "./pagination";
import VehicleModal from "./VehicleModal";
import VehicleFormModal from "./VehicleFormModal";

export type Vehicle = {
  id: number;
  clientId: number;
  brand?: string | null;
  model?: string | null;
  licensePlate: string;
  type?: string | null;
  registrationDate?: string | null;
  clientFirstName?: string | null;
  clientLastName?: string | null;
};


function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/**
 * La liste était rendue ENTIÈRE — 1 515 lignes, 411 Ko — puis filtrée dans le
 * navigateur. Elle est maintenant paginée et cherchée par l'API : la première
 * page arrive avec la page, le reste passe par le proxy. La recherche porte sur
 * la plaque, la marque, le modèle, le type, la date de mise en circulation et,
 * désormais, le propriétaire.
 */
export default function VehiclesList({
  initialPage,
  erreur = false,
}: {
  initialPage: Page<Vehicle>;
  erreur?: boolean;
}) {
  const [items, setItems] = useState<Vehicle[]>(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(VEHICLES_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);

  const seq = useRef(0);
  const charger = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/proxy/vehicles?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Page<Vehicle> | null) => {
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
  }, [search, page, pageSize]);

  useDebouncedEffect(charger, [search], 250);
  useDebouncedEffect(charger, [page, pageSize], 0);

  const vide = !loading && total === 0;

  return (
    <>
      <PageHeader
        title="Véhicules"
        description={`${total} véhicule${total > 1 ? "s" : ""}${search.trim() ? ` trouvé${total > 1 ? "s" : ""}` : ""}`}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Immat, marque, modèle, client..."
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
          <Button onClick={() => setNewVehicleOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau véhicule
          </Button>
        }
      />
      <PageBody>
        {erreur ? (
          <LoadError quoi="La liste des véhicules" />
        ) : vide && !search.trim() ? (
          <EmptyState
            icon={<Car className="h-5 w-5" />}
            title="Aucun véhicule"
            description="Ajoutez le premier véhicule à un client."
            action={
              <Button onClick={() => setNewVehicleOpen(true)}>
                <Plus className="h-4 w-4" />
                Nouveau véhicule
              </Button>
            }
          />
        ) : vide ? (
          <EmptyState
            icon={<Car className="h-5 w-5" />}
            title="Aucun résultat"
            description="Modifiez votre recherche."
          />
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Immat</TableHead>
                    <TableHead>Marque / Modèle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Mise en circulation</TableHead>
                    <TableHead>Client</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((v, idx) => (
                    <TableRow
                      key={v.id}
                      className={`cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                      onClick={() => setSelectedVehicleId(v.id)}
                    >
                      <TableCell className="font-mono text-sm font-medium">{v.licensePlate}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {[v.brand, v.model].filter(Boolean).join(" ") || <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.type || <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums text-sm">
                        {formatDate(v.registrationDate) || <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.clientLastName || v.clientFirstName
                          ? `${v.clientLastName ?? ""} ${v.clientFirstName ?? ""}`.trim()
                          : <span className="opacity-50">—</span>}
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

      <VehicleModal
        vehicleId={selectedVehicleId}
        onClose={() => setSelectedVehicleId(null)}
      />

      <VehicleFormModal
        open={newVehicleOpen}
        onClose={() => setNewVehicleOpen(false)}
        onSaved={(data) => {
          setItems((prev) => [data as Vehicle, ...prev]);
          setTotal((t) => t + 1);
          setNewVehicleOpen(false);
        }}
      />
    </>
  );
}
