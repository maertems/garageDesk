import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import SettingsForm from "./SettingsForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default async function SettingsPage() {
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
      <PageHeader
        title="Paramètres"
        description="Configuration du calendrier"
        back={{ href: "/admin", label: "Admin" }}
      />
      <PageBody>
        <div className="max-w-3xl">
          <SettingsForm initial={map} />
        </div>
      </PageBody>
    </>
  );
}
