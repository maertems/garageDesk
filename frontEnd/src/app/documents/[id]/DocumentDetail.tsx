"use client";

import { useState, useEffect } from "react";
import { User, Car } from "lucide-react";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ClientModal from "@/app/clients/ClientModal";
import VehicleModal from "@/app/vehicles/VehicleModal";
import { getLabel, billTypeLabels, billStatusLabels } from "@/lib/labels";

type Bill = {
  id: number;
  billId: number;
  docId: number | null;
  docNum: number | null;
  vmodId: string | null;
  vehicleId: number | null;
  clientId: number;
  account: string | null;
  dateDoc: string | null;
  dateBill: string | null;
  type: string | null;
  status: string;
  notBilled: number | null;
};

type BillDetail = {
  id: number;
  type: string | null;
  description: string | null;
  reference: string | null;
  time: number | null;
  timeEquivalentT1: number | null;
  priceHT: number | null;
  price: number | null;
  unitPrice: string | null;
  taxeType: string | null;
  taxe: number | null;
  cashBack: number | null;
};

type ClientInfo = {
  id: number;
  firstName: string | null;
  lastName: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  clientType: string;
} | null;

type VehicleInfo = {
  id: number;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  registrationDate: string | null;
  vin: string | null;
  mileage: number | null;
} | null;

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}


type Props = {
  bill: Bill;
  billDetails: BillDetail[];
  client: ClientInfo;
  vehicle: VehicleInfo;
};

export default function DocumentDetail({ bill, billDetails, client, vehicle }: Props) {
  const [clientModalId, setClientModalId] = useState<number | null>(null);
  const [vehicleModalId, setVehicleModalId] = useState<number | null>(null);
  const [backHref, setBackHref] = useState("/documents");

  useEffect(() => {
    const saved = sessionStorage.getItem("documentsBackUrl");
    if (saved) setBackHref(saved);
  }, []);

  const typeLabel = bill.type ? (getLabel(billTypeLabels, bill.type) || bill.type) : null;
  const statusLabel = getLabel(billStatusLabels, bill.status) || bill.status;

  return (
    <>
      <PageHeader
        title={`Dossier n°${bill.billId}`}
        back={{ href: backHref, label: "Documents" }}
      />
      <PageBody>
        <div className="space-y-4">

          {/* Dossier metadata — compact strip, en haut */}
          <div className="rounded-xl border bg-card shadow-card px-4 py-2.5">
            <div className="flex justify-between gap-6 text-xs">
              <div className="flex flex-wrap gap-x-5 gap-y-0.5">
                {[
                  { label: "Type", value: typeLabel },
                  { label: "Statut", value: statusLabel },
                  { label: "Date", value: formatDate(bill.dateDoc) },
                  { label: "Date factu.", value: formatDate(bill.dateBill) },
                  { label: "Non facturé", value: bill.notBilled != null ? (bill.notBilled ? "Oui" : "Non") : null },
                  { label: "Compte", value: bill.account },
                ].map(({ label, value }) => (
                  <span key={label} className="whitespace-nowrap">
                    <span className="text-muted-foreground">{label} </span>
                    <span className="font-medium">{value ?? <span className="text-muted-foreground/40">—</span>}</span>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-0.5 justify-end text-right shrink-0">
                {[
                  { label: "N° dossier", value: bill.docNum != null ? String(bill.docNum) : null },
                  { label: "Réf. bill", value: String(bill.billId) },
                  { label: "ID doc", value: bill.docId != null ? String(bill.docId) : null },
                  { label: "Réf. VM", value: bill.vmodId },
                ].map(({ label, value }) => (
                  <span key={label} className="whitespace-nowrap">
                    <span className="text-muted-foreground">{label} </span>
                    <span className="font-medium">{value ?? <span className="text-muted-foreground/40">—</span>}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Client + Véhicule */}
          <div className="grid grid-cols-2 gap-4">
            {/* Client — sans titre, icône en haut à droite */}
            <div className="relative rounded-xl border bg-card shadow-card p-3">
              <button
                title="Ouvrir la fiche client"
                onClick={() => setClientModalId(bill.clientId)}
                className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <User className="h-3.5 w-3.5" />
              </button>
              {client ? (
                <div className="grid grid-cols-2 gap-x-4 text-sm pr-6">
                  <div className="space-y-0.5">
                    <p className="font-medium leading-snug">
                      {[client.gender, client.lastName, client.firstName].filter(Boolean).join(" ")}
                    </p>
                    {client.address && <p className="text-muted-foreground text-xs leading-snug">{client.address}</p>}
                    {(client.postalCode || client.city) && (
                      <p className="text-muted-foreground text-xs leading-snug">
                        {[client.postalCode, client.city].filter(Boolean).join(" ")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-0.5 text-xs">
                    {client.phone && (
                      <p><span className="text-muted-foreground">Tél </span><span className="font-medium">{client.phone}</span></p>
                    )}
                    {client.email && (
                      <p className="break-all"><span className="text-muted-foreground">Email </span><span className="font-medium">{client.email}</span></p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pr-6">Client #{bill.clientId}</p>
              )}
            </div>

            {/* Véhicule — sans titre, icône en haut à droite */}
            <div className="relative rounded-xl border bg-card shadow-card p-3">
              {bill.vehicleId && (
                <button
                  title="Ouvrir la fiche véhicule"
                  onClick={() => setVehicleModalId(bill.vehicleId!)}
                  className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Car className="h-3.5 w-3.5" />
                </button>
              )}
              {vehicle ? (
                <div className="space-y-0.5 text-sm pr-6">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{vehicle.licensePlate}</span>
                    {[vehicle.brand, vehicle.model, vehicle.type].filter(Boolean).length > 0 && (
                      <>
                        <span className="text-muted-foreground/40 select-none">|</span>
                        <span className="font-medium">
                          {[vehicle.brand, vehicle.model, vehicle.type].filter(Boolean).join(" · ")}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {[
                      vehicle.vin,
                      vehicle.registrationDate ? formatDate(vehicle.registrationDate) : null,
                      vehicle.mileage != null ? `${vehicle.mileage.toLocaleString("fr-FR")} km` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ) : bill.vehicleId ? (
                <p className="text-sm text-muted-foreground pr-6">Véhicule #{bill.vehicleId}</p>
              ) : (
                <p className="text-sm text-muted-foreground/40 italic">Aucun véhicule associé</p>
              )}
            </div>
          </div>

          {/* BillDetails */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Lignes du dossier ({billDetails.length})
            </p>
            {billDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune ligne.</p>
            ) : (
              <div className="rounded-xl border bg-card shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Réf</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16 text-right">Temps</TableHead>
                        <TableHead className="w-16 text-right">Tps T1</TableHead>
                        <TableHead className="w-24">Unité</TableHead>
                        <TableHead className="w-24 text-right">Prix HT</TableHead>
                        <TableHead className="w-16 text-right">Taxe</TableHead>
                        <TableHead className="w-24 text-right">Prix TTC</TableHead>
                        <TableHead className="w-20 text-right">Remise</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {billDetails.map((d, idx) => (
                        <TableRow key={d.id} className={idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}>
                          <TableCell className="text-sm text-muted-foreground font-mono">{d.reference ?? <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-sm">{d.description ?? <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.time != null ? d.time : <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.timeEquivalentT1 != null ? d.timeEquivalentT1 : <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.unitPrice || <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.priceHT != null ? fmt(d.priceHT, " €") : <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.taxe != null ? d.taxe : <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium">{d.price != null ? fmt(d.price, " €") : <span className="opacity-40">—</span>}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.cashBack != null ? fmt(d.cashBack, "%") : <span className="opacity-40">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageBody>

      <ClientModal
        clientId={clientModalId}
        onClose={() => setClientModalId(null)}
      />
      <VehicleModal
        vehicleId={vehicleModalId}
        onClose={() => setVehicleModalId(null)}
      />
    </>
  );
}
