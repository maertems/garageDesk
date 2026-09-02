"use client";

import { useState, useMemo } from "react";
import { Car, Plus, Search } from "lucide-react";
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

export default function VehiclesList({
  initialVehicles = [],
  erreur = false,
}: {
  initialVehicles?: Vehicle[];
  erreur?: boolean;
}) {
  // La liste vient du serveur. Le repli qui allait la chercher au montage a été
  // retiré : il ne se déclenchait que sur une liste initiale vide, c'est-à-dire
  // précisément dans le cas où l'écran affichait « Aucun véhicule » avant de se
  // remplir.
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [search, setSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase().trim();
    return vehicles.filter((v) => {
      const plate = v.licensePlate.toLowerCase();
      const brand = (v.brand ?? "").toLowerCase();
      const model = (v.model ?? "").toLowerCase();
      const type = (v.type ?? "").toLowerCase();
      const regDate = formatDate(v.registrationDate).toLowerCase();
      const regRaw = (v.registrationDate ?? "").toLowerCase();
      return (
        plate.includes(q) ||
        brand.includes(q) ||
        model.includes(q) ||
        type.includes(q) ||
        regDate.includes(q) ||
        regRaw.includes(q)
      );
    });
  }, [vehicles, search]);

  return (
    <>
      <PageHeader
        title="Véhicules"
        description={`${filtered.length}${filtered.length !== vehicles.length ? ` sur ${vehicles.length}` : ""} véhicule${vehicles.length > 1 ? "s" : ""}`}
        search={
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Immat, marque, modèle, type, date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
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
        ) : vehicles.length === 0 ? (
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
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Car className="h-5 w-5" />}
            title="Aucun résultat"
            description="Modifiez votre recherche."
          />
        ) : (
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
                {filtered.map((v, idx) => (
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
          setVehicles((prev) => [data as Vehicle, ...prev]);
          setNewVehicleOpen(false);
        }}
      />
    </>
  );
}
