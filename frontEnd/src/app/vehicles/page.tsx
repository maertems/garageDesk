import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import type { Page } from "@/components/ui/pager";
import VehiclesList, { VEHICLES_PAGE_SIZE, type Vehicle } from "./VehiclesList";

/**
 * La première page est rendue par le serveur, comme celle des clients, et
 * l'attente est couverte par la frontière `app/loading.tsx`. Le reste de la
 * liste (1 515 véhicules, 411 Ko) n'est plus envoyé : la liste demande ses pages
 * et ses recherches à l'API.
 */
export default async function VehiclesPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);

  let page: Page<Vehicle> = { items: [], total: 0 };
  let erreur = false;
  try {
    const data = await apiJson<Page<Vehicle>>(
      `/api/v1/vehicles?limit=${VEHICLES_PAGE_SIZE}&offset=0`,
      cookie
    );
    if (data && Array.isArray(data.items)) page = data;
  } catch {
    // Un échec n'est pas une liste vide : la liste le dira au lieu d'annoncer
    // « Aucun véhicule ».
    erreur = true;
  }

  if (!(await session)) redirect("/login");

  return <VehiclesList initialPage={page} erreur={erreur} />;
}
