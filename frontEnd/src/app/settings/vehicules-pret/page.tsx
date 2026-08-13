import { cookies } from "next/headers";
import { apiJson } from "@/lib/api";
import LoanSettingsForm from "./LoanSettingsForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

// L'accès admin est déjà vérifié par settings/layout.tsx.
export default async function LoanVehicleSettingsPage() {
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
      <PageHeader
        title="Véhicules de prêt"
        description="Conditions imprimées sur le contrat de prêt"
      />
      <PageBody>
        <div className="max-w-3xl">
          <LoanSettingsForm initial={map} />
        </div>
      </PageBody>
    </>
  );
}
