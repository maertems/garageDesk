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
  try {
    const data = await apiJson<Client[]>("/api/v1/clients", cookie);
    clients = Array.isArray(data) ? data : [];
  } catch {
    //
  }
  return <ClientsList initialClients={clients} />;
}
