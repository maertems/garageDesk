import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import LogsPage from "./LogsPage";

// Réservé aux administrateurs : ces journaux portent des adresses IP, des
// identifiants d'utilisateur et des destinataires de notification. Le contrôle est
// refait côté API (get_current_admin) — celui-ci ne fait qu'éviter d'afficher une
// page vide à qui n'y a pas droit.
export default async function AdminLogsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let user: { role: string } | null = null;
  try {
    user = await apiJson<{ role: string }>("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  if (user?.role !== "admin") redirect("/");

  return (
    <>
      <PageHeader
        title="Journaux"
        description="Notifications, synchronisation et actions"
        back={{ href: "/admin", label: "Administration" }}
      />
      <PageBody>
        <LogsPage />
      </PageBody>
    </>
  );
}
