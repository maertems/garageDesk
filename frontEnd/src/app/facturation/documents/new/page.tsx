import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import NewDocumentPage from "./NewDocumentPage";

export default async function NewDocumentServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  return (
    <Suspense>
      <NewDocumentPage />
    </Suspense>
  );
}
