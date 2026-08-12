"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, KeyRound, CalendarRange, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import LoanReservationForm from "./LoanReservationForm";

type LoanVehicle = {
  id: number;
  brand?: string;
  model?: string;
  licensePlate: string;
  uniqueNumber: string;
  mileage?: number;
};
type LoanReservation = {
  id: number;
  loanVehicleId: number;
  clientId: number;
  startDate: string;
  endDate: string | null;
  loanVehicleUniqueNumber?: string;
  loanVehicleLicensePlate?: string;
  loanVehicleBrand?: string;
  loanVehicleModel?: string;
  clientFirstName?: string;
  clientLastName?: string;
};

function formatLoanVehicleDisplay(r: LoanReservation): string {
  const model = [r.loanVehicleBrand, r.loanVehicleModel].filter(Boolean).join(" ") || "";
  const plate = r.loanVehicleLicensePlate ?? "";
  return model && plate
    ? `${model} — ${plate}`
    : (plate || model || r.loanVehicleUniqueNumber) ?? String(r.loanVehicleId);
}

export default function LoanVehiclesSection({
  initialVehicles = [],
  initialReservations = [],
}: {
  initialVehicles?: LoanVehicle[];
  initialReservations?: LoanReservation[];
} = {}) {
  const [vehicles, setVehicles] = useState<LoanVehicle[]>(initialVehicles);
  const [reservations, setReservations] = useState<LoanReservation[]>(initialReservations);
  const [reservationFormOpen, setReservationFormOpen] = useState(false);
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null);
  const [fleetOpen, setFleetOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    fetch("/api/proxy/loanVehicles")
      .then((r) => r.json())
      .then((d) => setVehicles(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/proxy/loanReservations")
      .then((r) => r.json())
      .then((d) => setReservations(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const newRes = searchParams.get("newReservation");
    const editId = searchParams.get("editReservation");
    if (newRes != null) {
      setEditingReservationId(null);
      setReservationFormOpen(true);
      router.replace("/loan-vehicles", { scroll: false });
    } else if (editId) {
      const id = parseInt(editId, 10);
      if (!isNaN(id)) {
        setEditingReservationId(id);
        setReservationFormOpen(true);
        router.replace("/loan-vehicles", { scroll: false });
      }
    }
  }, [searchParams, router]);

  async function deleteVehicle(id: number) {
    if (!confirm("Supprimer ce véhicule de prêt ?")) return;
    const res = await fetch(`/api/proxy/loanVehicles/${id}`, { method: "DELETE" });
    if (res.ok) setVehicles((prev) => prev.filter((v) => v.id !== id));
  }
  async function deleteReservation(id: number) {
    if (!confirm("Supprimer cette réservation ?")) return;
    const res = await fetch(`/api/proxy/loanReservations/${id}`, { method: "DELETE" });
    if (res.ok) setReservations((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      <PageHeader
        title="Véhicules de prêt"
        description="Flotte de prêt et réservations"
      />
      <PageBody className="space-y-6">
        {/* Réservations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Réservations</h2>
            <Button
              onClick={() => {
                setEditingReservationId(null);
                setReservationFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nouvelle réservation
            </Button>
          </div>
          {reservations.length === 0 ? (
            <EmptyState
              icon={<CalendarRange className="h-5 w-5" />}
              title="Aucune réservation"
              description="Créez une réservation pour un client."
            />
          ) : (
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((r, idx) => (
                    <TableRow
                      key={r.id}
                      className={`cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                      onClick={() => {
                        setEditingReservationId(r.id);
                        setReservationFormOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">{formatLoanVehicleDisplay(r)}</TableCell>
                      <TableCell>
                        {r.clientFirstName} {r.clientLastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {new Date(r.startDate).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {r.endDate
                          ? new Date(r.endDate).toLocaleDateString("fr-FR")
                          : <span className="text-amber-600 text-xs font-medium">en cours</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReservation(r.id);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Flotte — repliable */}
        <section>
          <button
            type="button"
            onClick={() => setFleetOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform duration-200 ${fleetOpen ? "rotate-90" : ""}`}
            />
            <span className="font-medium">Flotte</span>
            <span className="text-xs opacity-60">({vehicles.length})</span>
          </button>

          {fleetOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex justify-end">
                <Button asChild size="sm">
                  <Link href="/loan-vehicles/new">
                    <Plus className="h-4 w-4" />
                    Nouveau véhicule
                  </Link>
                </Button>
              </div>
              {vehicles.length === 0 ? (
                <EmptyState
                  icon={<KeyRound className="h-5 w-5" />}
                  title="Aucun véhicule de prêt"
                  description="Ajoutez le premier véhicule à votre flotte."
                />
              ) : (
                <div className="rounded-xl border bg-card shadow-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>Plaque</TableHead>
                        <TableHead>Marque / Modèle</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicles.map((v, idx) => (
                        <TableRow key={v.id} className={idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}>
                          <TableCell className="font-mono">
                            <Link
                              href={`/loan-vehicles/${v.id}`}
                              className="font-semibold text-foreground hover:text-primary"
                            >
                              {v.uniqueNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="font-mono">{v.licensePlate}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {[v.brand, v.model].filter(Boolean).join(" ") || (
                              <span className="opacity-50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteVehicle(v.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </section>

        {reservationFormOpen && (
          <LoanReservationForm
            editingId={editingReservationId}
            onClose={() => setReservationFormOpen(false)}
            onSaved={() => {
              setReservationFormOpen(false);
              fetch("/api/proxy/loanReservations")
                .then((r) => r.json())
                .then((d) => setReservations(Array.isArray(d) ? d : []))
                .catch(() => {});
            }}
          />
        )}
      </PageBody>
    </>
  );
}
