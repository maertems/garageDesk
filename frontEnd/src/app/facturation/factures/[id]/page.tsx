import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import FactureDetail from "./FactureDetail";

export default async function FactureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : l'appel de données part en même temps.
  const session = verifierSession(cookie);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoice = await apiJson(`/api/v1/invoices/${id}`, cookie).catch(() => null);

  // La session AVANT l'absence : le `catch` d'origine renvoyait aussi les 401 sur
  // notFound(), donc une session expirée donnait une page « introuvable ».
  if (!(await session)) redirect("/login");
  if (!invoice) notFound();

  return <FactureDetail invoice={invoice as any} />;
}
