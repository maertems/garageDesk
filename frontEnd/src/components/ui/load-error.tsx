"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * À afficher quand la récupération d'une liste a ÉCHOUÉ.
 *
 * Les pages rattrapaient l'échec en retombant sur un tableau vide, et l'écran
 * annonçait alors « Aucun client » : une base intacte passait pour une base
 * vide. On distingue désormais les deux, et on propose de refaire le rendu
 * serveur plutôt que de laisser recharger la page à la main.
 */
export function LoadError({ quoi }: { quoi: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Chargement impossible"
      description={`${quoi} n'a pas pu être récupéré. Ce n'est pas une liste vide : le serveur n'a pas répondu.`}
      action={
        <Button variant="outline" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      }
    />
  );
}
