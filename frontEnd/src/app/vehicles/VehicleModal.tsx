"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ClientModal from "@/app/clients/ClientModal";

type VehicleDetail = {
  id: number;
  clientId: number;
  brand?: string | null;
  model?: string | null;
  licensePlate: string;
  vin?: string | null;
  mileage?: number | null;
  vmId?: number | null;
  type?: string | null;
  registrationDate?: string | null;
};

type VehicleExtra = {
  id: number;
  detailKey: string;
  detailValue?: string | null;
};

type ClientInfo = {
  id: number;
  firstName?: string | null;
  lastName: string;
  gender?: string | null;
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function InfoRow({ label, value }: { label: string; value?: string | null | number }) {
  const display = value !== null && value !== undefined && value !== "" ? String(value) : null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{display ?? <span className="text-muted-foreground/40">—</span>}</span>
    </div>
  );
}

type Props = {
  vehicleId: number | null;
  onClose: () => void;
};

export default function VehicleModal({ vehicleId, onClose }: Props) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [details, setDetails] = useState<VehicleExtra[]>([]);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientModalId, setClientModalId] = useState<number | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    setVehicle(null);
    setDetails([]);
    setClient(null);
    setLoading(true);
    Promise.all([
      fetch(`/api/proxy/vehicles/${vehicleId}`).then((r) => r.json()),
      fetch(`/api/proxy/vehicleDetails?vehicleId=${vehicleId}`).then((r) => r.json()),
    ])
      .then(([v, d]) => {
        setVehicle(v);
        setDetails(Array.isArray(d) ? d : []);
        if (v?.clientId) {
          fetch(`/api/proxy/clients/${v.clientId}`)
            .then((r) => r.json())
            .then((c) => setClient(c))
            .catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [vehicleId]);

  const title = vehicle
    ? [vehicle.brand, vehicle.model, vehicle.licensePlate].filter(Boolean).join(" — ")
    : "Véhicule";

  const clientLabel = client
    ? [client.gender, client.lastName, client.firstName].filter(Boolean).join(" ")
    : vehicle?.clientId
      ? `#${vehicle.clientId}`
      : null;

  return (
    <>
      <Dialog open={vehicleId !== null && clientModalId === null} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b pr-12 gap-4">
            <DialogTitle className="truncate">{loading ? "Chargement…" : title}</DialogTitle>
            {!loading && vehicle && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/vehicles/${vehicleId}`)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">Chargement…</div>
          ) : vehicle ? (
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Info véhicule */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                <InfoRow label="Immatriculation" value={vehicle.licensePlate} />
                <InfoRow label="Marque" value={vehicle.brand} />
                <InfoRow label="Modèle" value={vehicle.model} />
                <InfoRow label="Type / Finition" value={vehicle.type} />
                <InfoRow label="Mise en circulation" value={formatDate(vehicle.registrationDate)} />
                <InfoRow label="Kilométrage" value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString("fr-FR")} km` : null} />
                <InfoRow label="VIN" value={vehicle.vin} />
                {vehicle.vmId != null && <InfoRow label="Réf. VM" value={vehicle.vmId} />}
              </div>

              {/* Client */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Propriétaire
                </p>
                {clientLabel ? (
                  <button
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={() => setClientModalId(vehicle.clientId)}
                  >
                    {clientLabel}
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>

              {/* vehicleDetails */}
              {details.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Détails ({details.length})
                  </p>
                  <div className="rounded-lg border overflow-hidden">
                    <div className="max-h-[200px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 text-xs py-0 w-1/2">Clé</TableHead>
                            <TableHead className="h-8 text-xs py-0">Valeur</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.map((d, idx) => (
                            <TableRow key={d.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                              <TableCell className="py-2 text-sm font-medium">{d.detailKey}</TableCell>
                              <TableCell className="py-2 text-sm text-muted-foreground">
                                {d.detailValue ?? <span className="opacity-40">—</span>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ClientModal
        clientId={clientModalId}
        onClose={() => setClientModalId(null)}
      />
    </>
  );
}
