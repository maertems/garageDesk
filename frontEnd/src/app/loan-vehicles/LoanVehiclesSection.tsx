"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, KeyRound, CalendarRange, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import LoanFleetCalendar from "./LoanFleetCalendar";
import VehicleLabel, { VEHICLE_COL, VEHICLE_COL_INNER } from "./VehicleLabel";

type LoanVehicle = {
  id: number;
  brand?: string;
  model?: string;
  licensePlate: string;
  uniqueNumber: string;
  mileage?: number;
  active?: boolean;
};
type LoanReservation = {
  id: number;
  loanVehicleId: number;
  clientId: number;
  startDate: string;
  endDate: string | null;
  appointmentId?: number | null;
  loanVehicleUniqueNumber?: string;
  loanVehicleLicensePlate?: string;
  loanVehicleBrand?: string;
  loanVehicleModel?: string;
  clientFirstName?: string;
  clientLastName?: string;
  interventionVehicleBrand?: string | null;
  interventionVehicleModel?: string | null;
};

const RESERVATIONS_PER_PAGE = 10;

// Aligne la hauteur de ligne des tableaux sur les 36 px du calendrier. Le
// padding vertical des cellules doit être annulé, sinon il s'ajoute à `h-9` ;
// les boutons d'action sont réduits à 28 px pour la même raison (un bouton
// `size="icon"` fait 36 px et repoussait la ligne au-delà).
const ROW_HEIGHT = "[&_tbody_tr]:h-9 [&_td]:py-0";

function startOfDayMs(value: string | Date): number {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Statut déduit des dates, en gardant la même occupation que le calendrier :
// une réservation dont la fin est aujourd'hui immobilise encore le véhicule,
// elle reste donc « en cours ». Sans date de fin, elle l'est jusqu'à clôture.
function reservationStatus(r: LoanReservation, todayMs: number) {
  if (startOfDayMs(r.startDate) > todayMs) {
    return { label: "À venir", variant: "default" as const };
  }
  if (r.endDate != null && startOfDayMs(r.endDate) < todayMs) {
    return { label: "Terminée", variant: "secondary" as const };
  }
  return { label: "En cours", variant: "warning" as const };
}

// Marque/modèle et immatriculation séparés, la case « Véhicule » les affichant
// aux deux extrémités. Sans marque/modèle, l'immatriculation (ou à défaut le
// numéro unique) devient le libellé principal.
function loanVehicleParts(r: LoanReservation): { label: string; plate?: string } {
  const model = [r.loanVehicleBrand, r.loanVehicleModel].filter(Boolean).join(" ");
  const plate = r.loanVehicleLicensePlate ?? "";
  if (model) return { label: model, plate: plate || undefined };
  return { label: plate || r.loanVehicleUniqueNumber || String(r.loanVehicleId) };
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
  const [reservationPage, setReservationPage] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();

  const todayMs = startOfDayMs(new Date());
  const pageCount = Math.max(1, Math.ceil(reservations.length / RESERVATIONS_PER_PAGE));
  // Borné à chaque rendu : une suppression ou un rechargement peut raccourcir la
  // liste alors qu'on est sur la dernière page.
  const currentPage = Math.min(reservationPage, pageCount - 1);
  const pageStart = currentPage * RESERVATIONS_PER_PAGE;
  const pagedReservations = reservations.slice(pageStart, pageStart + RESERVATIONS_PER_PAGE);

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
  // Désactiver retire le véhicule de l'offre (listes de choix des réservations,
  // grisé dans le calendrier) sans toucher à ses réservations existantes.
  async function toggleVehicleActive(v: LoanVehicle) {
    const next = v.active === false;
    const res = await fetch(`/api/proxy/loanVehicles/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicles((prev) =>
        prev.map((x) => (x.id === v.id ? { ...x, active: updated.active } : x))
      );
    }
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
        {/* Disponibilité de la flotte — 30 jours glissants */}
        {vehicles.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Disponibilité (30 prochains jours)</h2>
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
            <LoanFleetCalendar
              vehicles={vehicles}
              reservations={reservations}
              onReservationClick={(id) => {
                setEditingReservationId(id);
                setReservationFormOpen(true);
              }}
            />
          </section>
        )}

        {/* Réservations */}
        <section>
          <h2 className="text-base font-semibold mb-3">Réservations</h2>
          {reservations.length === 0 ? (
            <EmptyState
              icon={<CalendarRange className="h-5 w-5" />}
              title="Aucune réservation"
              description="Créez une réservation pour un client."
            />
          ) : (
            <div className="rounded-xl border bg-card shadow-card overflow-hidden">
              <Table className={`text-xs ${ROW_HEIGHT}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3" style={{ width: VEHICLE_COL }}>
                      Véhicule
                    </TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedReservations.map((r, idx) => (
                    <TableRow
                      key={r.id}
                      className={`cursor-pointer ${idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}`}
                      onClick={() => {
                        setEditingReservationId(r.id);
                        setReservationFormOpen(true);
                      }}
                    >
                      <TableCell className="px-3">
                        <VehicleLabel {...loanVehicleParts(r)} width={VEHICLE_COL_INNER} />
                      </TableCell>
                      <TableCell>
                        {r.clientFirstName} {r.clientLastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {new Date(r.startDate).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {r.endDate
                          ? new Date(r.endDate).toLocaleDateString("fr-FR")
                          : <span className="opacity-50">—</span>}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const status = reservationStatus(r, todayMs);
                          return <Badge variant={status.variant}>{status.label}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* stopPropagation : la ligne entière ouvre le modal de
                            modification, un clic sur le contrat ne doit pas le faire. */}
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                        >
                          <a
                            href={`/api/proxy/loanReservations/${r.id}/contract-pdf`}
                            download={`contrat-pret-${r.loanVehicleUniqueNumber ?? r.id}.pdf`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Contrat de prêt (PDF)"
                            title="Contrat de prêt (PDF)"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteReservation(r.id);
                          }}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageCount > 1 && (
                <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {pageStart + 1}–{pageStart + pagedReservations.length} sur {reservations.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={currentPage === 0}
                      onClick={() => setReservationPage(currentPage - 1)}
                      aria-label="Page précédente"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="tabular-nums px-1">
                      {currentPage + 1} / {pageCount}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => setReservationPage(currentPage + 1)}
                      aria-label="Page suivante"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
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
                  <Table className={ROW_HEIGHT}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N°</TableHead>
                        <TableHead>Marque / Modèle</TableHead>
                        <TableHead>Plaque</TableHead>
                        <TableHead>Actif</TableHead>
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
                          <TableCell className="font-medium">
                            {[v.brand, v.model].filter(Boolean).join(" ") || (
                              <span className="opacity-50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {v.licensePlate}
                          </TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={v.active !== false}
                              onChange={() => toggleVehicleActive(v)}
                              title={
                                v.active !== false
                                  ? "Désactiver — le véhicule ne sera plus proposé aux clients"
                                  : "Activer — le véhicule redevient disponible"
                              }
                              aria-label={v.active !== false ? "Désactiver" : "Activer"}
                              className="h-4 w-4 accent-primary"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteVehicle(v.id)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
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
