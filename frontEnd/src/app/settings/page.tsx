import { cookies } from "next/headers";
import { apiJson } from "@/lib/api";
import SettingsForm, {
  type AppointmentCategory,
  type AppointmentStatus,
} from "./SettingsForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

// L'accès admin est déjà vérifié par settings/layout.tsx.
export default async function SettingsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Réglages, catégories et statuts rendus ensemble par le serveur : la page
  // s'affiche garnie du premier coup (cf. § 80).
  const [list, categories, statuses] = await Promise.all([
    apiJson<{ key: string; value: string }[]>("/api/v1/settings", cookie).catch(
      () => [] as { key: string; value: string }[]
    ),
    apiJson<AppointmentCategory[]>("/api/v1/appointmentCategories", cookie).catch(
      () => [] as AppointmentCategory[]
    ),
    apiJson<AppointmentStatus[]>("/api/v1/appointmentStatuses", cookie).catch(
      () => [] as AppointmentStatus[]
    ),
  ]);

  const map: Record<string, string> = {};
  if (Array.isArray(list)) list.forEach((s) => (map[s.key] = s.value ?? ""));
  return (
    <>
      <PageHeader title="Calendrier" description="Configuration du calendrier" />
      <PageBody>
        <div className="max-w-3xl">
          <SettingsForm
            initial={map}
            initialCategories={Array.isArray(categories) ? categories : []}
            initialStatuses={Array.isArray(statuses) ? statuses : []}
          />
        </div>
      </PageBody>
    </>
  );
}
