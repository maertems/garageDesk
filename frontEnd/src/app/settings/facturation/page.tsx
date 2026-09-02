import { cookies } from "next/headers";
import { apiJson } from "@/lib/api";
import CataloguePage, { type Article, type VatRate } from "./CataloguePage";

// L'accès admin est déjà vérifié par settings/layout.tsx.
//
// Le catalogue et les taux sont rendus ici : le navigateur allait les chercher au
// montage, et les onglets affichaient « Aucun article. » puis « Aucun taux de
// TVA. » avant de se remplir.
export default async function CatalogueServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  const [articles, vatRates] = await Promise.all([
    apiJson<Article[]>("/api/v1/articles", cookie).catch(() => [] as Article[]),
    apiJson<VatRate[]>("/api/v1/vatRates", cookie).catch(() => [] as VatRate[]),
  ]);

  return (
    <CataloguePage
      isAdmin={true}
      initialArticles={Array.isArray(articles) ? articles : []}
      initialVatRates={Array.isArray(vatRates) ? vatRates : []}
    />
  );
}
