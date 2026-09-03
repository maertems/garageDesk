import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import AvoirDetail from "./AvoirDetail";

export default async function AvoirDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : l'appel de données part en même temps.
  const session = verifierSession(cookie);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cn = await apiJson(`/api/v1/creditNotes/${id}`, cookie).catch(() => null);

  // La session AVANT l'absence : le `catch` d'origine renvoyait aussi les 401 sur
  // notFound(), donc une session expirée donnait une page « introuvable ».
  if (!(await session)) redirect("/login");
  if (!cn) notFound();

  return <AvoirDetail creditNote={cn as any} />;
}
