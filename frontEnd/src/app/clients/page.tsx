import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import ClientsList from "./ClientsList";

type Client = { id: number; firstName: string; lastName: string; phone?: string; email?: string; city?: string; postalCode?: string; clientType: string };

export default async function ClientsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  let clients: Client[] = [];
  let erreur = false;
  try {
    const data = await apiJson<Client[]>("/api/v1/clients", cookie);
    clients = Array.isArray(data) ? data : [];
  } catch {
    // Le repli sur un tableau vide affichait « Aucun client » : une panne de
    // l'API passait pour une base vide. On distingue les deux cas.
    erreur = true;
  }
  return <ClientsList initialClients={clients} erreur={erreur} />;
}
