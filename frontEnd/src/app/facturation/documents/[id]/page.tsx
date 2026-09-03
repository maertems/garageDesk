import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import DocumentDetail, { type BillingDocument } from "./DocumentDetail";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : l'appel de données part en même temps.
  const session = verifierSession(cookie);
  const document = await apiJson<BillingDocument>(`/api/v1/documents/${id}`, cookie).catch(() => null);

  // La session AVANT l'absence : le `catch` d'origine renvoyait aussi les 401 sur
  // notFound(), donc une session expirée donnait une page « introuvable ».
  if (!(await session)) redirect("/login");
  if (!document) notFound();

  return <DocumentDetail initialDocument={document} />;
}
