import { cookies } from "next/headers";
import { apiJson } from "@/lib/api";
import SettingsForm from "./SettingsForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

// L'accès admin est déjà vérifié par settings/layout.tsx.
export default async function SettingsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let list: { key: string; value: string }[] = [];
  try {
    const data = await apiJson<{ key: string; value: string }[]>("/api/v1/settings", cookie);
    list = Array.isArray(data) ? data : [];
  } catch {
    //
  }
  const map: Record<string, string> = {};
  if (Array.isArray(list)) list.forEach((s) => (map[s.key] = s.value ?? ""));
  return (
    <>
      <PageHeader title="Calendrier" description="Configuration du calendrier" />
      <PageBody>
        <div className="max-w-3xl">
          <SettingsForm initial={map} />
        </div>
      </PageBody>
    </>
  );
}
