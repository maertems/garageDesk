import CataloguePage from "./CataloguePage";

// L'accès admin est déjà vérifié par settings/layout.tsx.
export default function CatalogueServerPage() {
  return <CataloguePage isAdmin={true} />;
}
