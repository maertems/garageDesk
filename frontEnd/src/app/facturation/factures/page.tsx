import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import FacturesPage from "./FacturesPage";

export default async function FacturesServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  if (!(await session)) redirect("/login");

  return <FacturesPage />;
}
