import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import type { Page } from "@/components/ui/pager";
import ClientsList, { CLIENTS_PAGE_SIZE, type Client } from "./ClientsList";

export default async function ClientsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  // Première page seulement : la liste entière (1 136 fiches, 334 Ko) partait
  // avec chaque affichage de la page. La suite est demandée par la liste, à la
  // recherche ou au changement de page.
  let page: Page<Client> = { items: [], total: 0 };
  let erreur = false;
  try {
    const data = await apiJson<Page<Client>>(
      `/api/v1/clients?sortBy=createdAt&order=desc&limit=${CLIENTS_PAGE_SIZE}&offset=0`,
      cookie
    );
    if (data && Array.isArray(data.items)) page = data;
  } catch {
    // Le repli sur un tableau vide affichait « Aucun client » : une panne de
    // l'API passait pour une base vide. On distingue les deux cas.
    erreur = true;
  }
  if (!(await session)) redirect("/login");

  return <ClientsList initialPage={page} erreur={erreur} />;
}
