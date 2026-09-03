import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import ClientForm from "../ClientForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default async function ClientEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await cookies();
  // Session lancée sans être attendue : la fiche part en même temps.
  const session = verifierSession(c.toString());
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
  const client = await apiJson<Client>(`/api/v1/clients/${id}`, c.toString()).catch(
    () => null
  );

  // La session AVANT l'absence : le `catch` d'origine renvoyait aussi les 401 sur
  // notFound(), donc une session expirée donnait une page « introuvable ».
  if (!(await session)) redirect("/login");
  if (!client) notFound();

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
