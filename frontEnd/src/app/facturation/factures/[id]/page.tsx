import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import FactureDetail from "./FactureDetail";

export default async function FactureDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
    const invoice = await apiJson(`/api/v1/invoices/${id}`, cookie) as any;
    return <FactureDetail invoice={invoice} />;
  } catch {
    notFound();
  }
}
