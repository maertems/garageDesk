import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import DocumentsList from "./DocumentsList";
import { apiQuery, lireQuery } from "./query";

export type BillListItem = {
  id: number;
  billId: number;
  docNum: number | null;
  dateDoc: string | null;
  type: string | null;
  status: string;
  vehicleId: number | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleLicensePlate: string | null;
  clientId: number;
  clientFirstName: string | null;
  clientLastName: string | null;
};

/** Une page de documents, avec les deux totaux que l'en-tête affiche. */
export type BillPage = {
  items: BillListItem[];
  total: number;
  totalAll: number;
  hiddenCount: number;
};

const PAGE_VIDE: BillPage = { items: [], total: 0, totalAll: 0, hiddenCount: 0 };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  // La page demandée, et elle seule — les mêmes paramètres que la liste met dans
  // l'URL. La liste entière (5 125 documents, 1,5 Mo) ne part plus.
  const query = lireQuery((k) => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
  });
  let page = PAGE_VIDE;
  try {
    const data = await apiJson<BillPage>(`/api/v1/bills?${apiQuery(query)}`, cookie);
    if (data && Array.isArray(data.items)) page = data;
  } catch {
    //
  }
  if (!(await session)) redirect("/login");

  return (
    <Suspense>
      <DocumentsList initialPage={page} />
    </Suspense>
  );
}
