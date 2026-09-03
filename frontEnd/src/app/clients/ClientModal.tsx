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
import { getLabel, billStatusLabels, clientTypeLabels } from "@/lib/labels";

type ClientDetail = {
  id: number;
  firstName: string | null;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  clientType: string;
  gender?: string | null;
  vatNumber?: string | null;
  siren?: string | null;
};

type Vehicle = {
  id: number;
  licensePlate: string;
  brand?: string | null;
  model?: string | null;
};

type Bill = {
  id: number;
  docNum?: number | null;
  dateDoc?: string | null;
  type?: string | null;
  status: string;
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium">{value || <span className="text-muted-foreground/40">—</span>}</span>
    </div>
  );
}

type Props = {
  clientId: number | null;
  onClose: () => void;
  /**
   * Masque le bouton « Modifier ». Il navigue vers la fiche, ce qui, depuis un
   * formulaire de rendez-vous en cours de saisie, la ferait perdre sans
   * avertissement. Les listes, elles, gardent le bouton : rien n'y est en cours.
   */
  hideEdit?: boolean;
};

export default function ClientModal({ clientId, onClose, hideEdit = false }: Props) {
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setClient(null);
    setVehicles([]);
    setBills([]);
    setLoading(true);
    Promise.all([
      fetch(`/api/proxy/clients/${clientId}`).then((r) => r.json()),
      fetch(`/api/proxy/vehicles?clientId=${clientId}`).then((r) => r.json()),
      fetch(`/api/proxy/bills?clientId=${clientId}`).then((r) => r.json()),
    ])
      .then(([c, v, b]) => {
        setClient(c);
        setVehicles(Array.isArray(v) ? v : []);
        const sorted = Array.isArray(b)
          ? [...b].sort((a: Bill, z: Bill) => (z.dateDoc ?? "").localeCompare(a.dateDoc ?? ""))
          : [];
        setBills(sorted);
      })
      .finally(() => setLoading(false));
  }, [clientId]);

  const title = client
    ? [client.gender, client.lastName, client.firstName].filter(Boolean).join(" ")
    : "Client";

  return (
    <Dialog open={clientId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b pr-12 gap-4">
          <DialogTitle className="truncate">{loading ? "Chargement…" : title}</DialogTitle>
          {!loading && client && !hideEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/clients/${clientId}`)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Modifier
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm">Chargement…</div>
        ) : client ? (
          <div className="px-6 py-5 flex flex-col gap-5">
            {/* Info client */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <InfoRow label="Civilité" value={client.gender} />
              <InfoRow label="Type" value={getLabel(clientTypeLabels, client.clientType)} />
              <InfoRow label="Nom" value={client.lastName} />
              <InfoRow label="Prénom" value={client.firstName} />
              <InfoRow label="Téléphone" value={client.phone} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow
                label="Adresse"
                value={[client.address, client.postalCode, client.city].filter(Boolean).join(", ")}
              />
              {client.vatNumber && <InfoRow label="TVA" value={client.vatNumber} />}
              {client.siren && <InfoRow label="SIREN" value={client.siren} />}
            </div>

            {/* Véhicules */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Véhicules ({vehicles.length})
              </p>
              {vehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun véhicule associé.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[168px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs py-0">Immat</TableHead>
                          <TableHead className="h-8 text-xs py-0">Marque</TableHead>
                          <TableHead className="h-8 text-xs py-0">Modèle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vehicles.map((v, idx) => (
                          <TableRow key={v.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                            <TableCell className="py-2 font-mono text-sm">{v.licensePlate}</TableCell>
                            <TableCell className="py-2 text-sm text-muted-foreground">{v.brand ?? <span className="opacity-40">—</span>}</TableCell>
                            <TableCell className="py-2 text-sm text-muted-foreground">{v.model ?? <span className="opacity-40">—</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>

            {/* Documents */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Documents ({bills.length})
              </p>
              {bills.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document associé.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-[168px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs py-0">N° doc</TableHead>
                          <TableHead className="h-8 text-xs py-0">Date</TableHead>
                          <TableHead className="h-8 text-xs py-0">Type</TableHead>
                          <TableHead className="h-8 text-xs py-0">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bills.map((b, idx) => (
                          <TableRow key={b.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                            <TableCell className="py-2 tabular-nums text-sm font-medium">{b.docNum ?? <span className="opacity-40">—</span>}</TableCell>
                            <TableCell className="py-2 tabular-nums text-sm text-muted-foreground">{formatDate(b.dateDoc)}</TableCell>
                            <TableCell className="py-2 text-sm font-mono text-muted-foreground">{b.type ?? <span className="opacity-40">—</span>}</TableCell>
                            <TableCell className="py-2 text-sm text-muted-foreground">{getLabel(billStatusLabels, b.status) || b.status}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
