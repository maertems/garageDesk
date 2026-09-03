import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import { PageLoading } from "@/components/ui/page-loading";
import LoanVehiclesSection, {
  type LoanReservation,
  type LoanVehicle,
} from "./LoanVehiclesSection";

/**
 * Flotte et réservations rendues par le serveur. Elles étaient récupérées par le
 * navigateur au montage de la section : l'écran affichait « Aucun véhicule de
 * prêt » et « Aucune réservation » le temps des deux appels.
 *
 * Le `Suspense` reste nécessaire : la section lit `useSearchParams()`, ce qui
 * exige une frontière au-dessus d'elle.
 */
export default async function LoanVehiclesPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);

  let erreur = false;
  const [vehicles, reservations] = await Promise.all([
    apiJson<LoanVehicle[]>("/api/v1/loanVehicles", cookie).catch(() => {
      erreur = true;
      return [] as LoanVehicle[];
    }),
    apiJson<LoanReservation[]>("/api/v1/loanReservations", cookie).catch(() => {
      erreur = true;
      return [] as LoanReservation[];
    }),
  ]);

  if (!(await session)) redirect("/login");

  return (
    <Suspense fallback={<PageLoading className="min-h-[60vh]" />}>
      <LoanVehiclesSection
        initialVehicles={Array.isArray(vehicles) ? vehicles : []}
        initialReservations={Array.isArray(reservations) ? reservations : []}
        erreur={erreur}
      />
    </Suspense>
  );
}
