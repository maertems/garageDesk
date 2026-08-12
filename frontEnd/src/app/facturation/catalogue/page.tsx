import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import CataloguePage from "./CataloguePage";

export default async function CatalogueServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let user: { id: number; login: string; role: string };
  try {
    user = await apiJson<{ id: number; login: string; role: string }>("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  return <CataloguePage isAdmin={user.role === "admin"} />;
}
