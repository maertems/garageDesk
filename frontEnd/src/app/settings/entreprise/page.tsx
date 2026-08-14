import { cookies } from "next/headers";
import { apiJson } from "@/lib/api";
import ParametresPage from "./ParametresPage";

type CompanySettings = {
  id: number;
  name: string;
  shareCapital: number | null;
  siren: string | null;
  siretHeadquarters: string | null;
  rcsCity: string | null;
  vatIntracom: string | null;
  nafCode: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  phone: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
  mediatorName: string | null;
  mediatorUrl: string | null;
  mediatorAddress: string | null;
  vatExemption: boolean;
  hasLogo: boolean;
  missingMandatoryFields: string[];
};

// L'accès admin est déjà vérifié par settings/layout.tsx.
export default async function ParametresServerPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  let settings: CompanySettings | null = null;
  try {
    settings = await apiJson<CompanySettings>("/api/v1/companySettings", cookie);
  } catch {
    // affiche formulaire vide avec erreur
  }

  return <ParametresPage initial={settings} />;
}
