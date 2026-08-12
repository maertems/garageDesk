"use client";

/**
 * Cartes Client + Véhicule — reprend exactement la présentation de
 * /documents/[id] (DocumentDetail.tsx du module bills importés), pour que
 * les documents de facturation affichent les mêmes informations, à la
 * création comme à la modification.
 */

import { useState, useEffect } from "react";
import { User, Car } from "lucide-react";
import ClientModal from "@/app/clients/ClientModal";
import VehicleModal from "@/app/vehicles/VehicleModal";

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

type Props = {
  clientId: number | null;
  vehicleId: number | null;
  /** Kilométrage du dossier de facturation à la prise en charge (entête),
   * distinct du kilométrage général du véhicule — affiché en plus si fourni. */
  intakeKilometrage?: number | null;
};

export default function ClientVehicleCards({ clientId, vehicleId, intakeKilometrage }: Props) {
  const [client, setClient] = useState<ClientInfo>(null);
  const [vehicle, setVehicle] = useState<VehicleInfo>(null);
  const [clientModalId, setClientModalId] = useState<number | null>(null);
  const [vehicleModalId, setVehicleModalId] = useState<number | null>(null);

  useEffect(() => {
    if (!clientId) {
      setClient(null);
      return;
    }
    fetch(`/api/proxy/clients/${clientId}`)
      .then((r) => r.json())
      .then(setClient)
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    if (!vehicleId) {
      setVehicle(null);
      return;
    }
    fetch(`/api/proxy/vehicles/${vehicleId}`)
      .then((r) => r.json())
      .then(setVehicle)
      .catch(() => {});
  }, [vehicleId]);

  if (!clientId) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {/* Client — sans titre, icône en haut à droite */}
        <div className="relative rounded-xl border bg-card shadow-card p-3">
          <button
            type="button"
            title="Ouvrir la fiche client"
            onClick={() => setClientModalId(clientId)}
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
            <p className="text-sm text-muted-foreground pr-6">Client #{clientId}</p>
          )}
        </div>

        {/* Véhicule — sans titre, icône en haut à droite */}
        <div className="relative rounded-xl border bg-card shadow-card p-3">
          {vehicleId && (
            <button
              type="button"
              title="Ouvrir la fiche véhicule"
              onClick={() => setVehicleModalId(vehicleId)}
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
              {intakeKilometrage != null && (
                <p className="text-muted-foreground text-xs">
                  Km à la prise en charge · {intakeKilometrage.toLocaleString("fr-FR")} km
                </p>
              )}
            </div>
          ) : vehicleId ? (
            <p className="text-sm text-muted-foreground pr-6">Véhicule #{vehicleId}</p>
          ) : (
            <p className="text-sm text-muted-foreground/40 italic">Aucun véhicule associé</p>
          )}
        </div>
      </div>

      <ClientModal clientId={clientModalId} onClose={() => setClientModalId(null)} />
      <VehicleModal vehicleId={vehicleModalId} onClose={() => setVehicleModalId(null)} />
    </>
  );
}
