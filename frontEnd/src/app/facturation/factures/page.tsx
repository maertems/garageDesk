import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import FacturesPage from "./FacturesPage";

export default async function FacturesServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  return <FacturesPage />;
}
