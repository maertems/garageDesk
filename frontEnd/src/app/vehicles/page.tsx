import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import VehiclesList, { type Vehicle } from "./VehiclesList";

/**
 * La liste était récupérée par le navigateur, au montage du composant : l'écran
 * affichait « Aucun véhicule » le temps de l'aller-retour, puis le tableau
 * apparaissait. Elle est maintenant rendue par le serveur, comme celle des
 * clients, et l'attente est couverte par la frontière `app/loading.tsx`.
 */
export default async function VehiclesPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }

  let vehicles: Vehicle[] = [];
  let erreur = false;
  try {
    const data = await apiJson<Vehicle[]>("/api/v1/vehicles", cookie);
    vehicles = Array.isArray(data) ? data : [];
  } catch {
    // Un échec n'est pas une liste vide : la liste le dira au lieu d'annoncer
    // « Aucun véhicule ».
    erreur = true;
  }

  return <VehiclesList initialVehicles={vehicles} erreur={erreur} />;
}
