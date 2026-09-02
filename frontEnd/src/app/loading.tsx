import { PageLoading } from "@/components/ui/page-loading";

/**
 * Frontière d'attente commune à toutes les routes.
 *
 * Posée à la racine de `app/`, elle couvre chaque segment qui n'a pas la sienne
 * — clients, véhicules, facturation, réglages… Deux effets, tous deux voulus :
 *
 *   * au chargement complet, le HTML de la coquille (barre latérale comprise)
 *     part immédiatement et le contenu suit en flux, au lieu de laisser le
 *     navigateur sur une page blanche le temps de l'aller-retour vers l'API ;
 *   * à la navigation interne, le rond qui tourne remplace la page précédente
 *     dès le clic, et non quand la nouvelle est prête.
 *
 * Le layout étant en `dynamic = "force-dynamic"`, aucune de ces pages n'est
 * prérendue : cette attente est la règle, pas l'exception.
 */
export default function Loading() {
  return <PageLoading className="min-h-[60vh]" />;
}
