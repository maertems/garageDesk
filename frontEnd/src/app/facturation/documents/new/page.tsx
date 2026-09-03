import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import NewDocumentPage from "./NewDocumentPage";

export default async function NewDocumentServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  if (!(await session)) redirect("/login");

  return (
    <Suspense>
      <NewDocumentPage />
    </Suspense>
  );
}
