import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import FacturationTabs from "./FacturationTabs";

/**
 * Module de facturation, réservé aux administrateurs tant qu'il est en bêta.
 *
 * Le contrôle est ici, côté serveur, et pas seulement dans la barre latérale :
 * un lien masqué n'empêche personne de saisir l'adresse. Même garde que
 * `settings/layout.tsx`, et il couvre tout le sous-arbre — documents, factures,
 * avoirs, création — sans qu'il faille y penser page par page.
 *
 * ⚠️ Ceci protège l'ÉCRAN, pas les données : les routes `/api/v1/documents`,
 * `/invoices` et `/creditNotes` restent ouvertes à tout utilisateur connecté.
 * Fermer l'API est un autre sujet, et il touche aussi la synchronisation.
 */
export default async function FacturationLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let user: { role?: string } | null = null;
  try {
    user = await apiJson<{ role?: string }>("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  if (!user || user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <FacturationTabs />
      <div className="flex-1">{children}</div>
    </div>
  );
}
