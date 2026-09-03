import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import AvoirsPage from "./AvoirsPage";

export default async function AvoirsServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  if (!(await session)) redirect("/login");

  return <AvoirsPage />;
}
