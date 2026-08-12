import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import DocumentDetail, { type BillingDocument } from "./DocumentDetail";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  try {
    const document = await apiJson<BillingDocument>(`/api/v1/documents/${id}`, cookie);
    return <DocumentDetail initialDocument={document} />;
  } catch {
    notFound();
  }
}
