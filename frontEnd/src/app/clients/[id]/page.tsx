import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import ClientForm from "../ClientForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default async function ClientEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cookies();
  try {
    await apiJson("/api/v1/auth/me", c.toString());
  } catch {
    redirect("/login");
  }
  type Client = {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    address?: string;
    clientType: string;
    gender?: string;
    vatNumber?: string;
    siren?: string;
  };
  let client: Client | null = null;
  try {
    client = await apiJson<Client>(`/api/v1/clients/${id}`, c.toString());
  } catch {
    notFound();
  }
  return (
    <>
      <PageHeader
        title={`${client?.lastName ?? ""} ${client?.firstName ?? ""}`.trim() || "Client"}
        description="Modifier la fiche client"
        back={{ href: "/clients", label: "Clients" }}
      />
      <PageBody>
        <div className="max-w-3xl">
          <ClientForm initial={client} />
        </div>
      </PageBody>
    </>
  );
}
