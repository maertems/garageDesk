import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import AvoirDetail from "./AvoirDetail";

export default async function AvoirDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cn = await apiJson(`/api/v1/creditNotes/${id}`, cookie) as any;
    return <AvoirDetail creditNote={cn} />;
  } catch {
    notFound();
  }
}
