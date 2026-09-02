import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bloc d'attente, à mettre là où le contenu n'est pas encore arrivé.
 *
 * Il existe pour une raison précise : sans lui, une liste vide et une liste pas
 * encore chargée s'affichent de la même façon — « Aucun client » pendant que la
 * requête est en cours. C'est faux, et c'est ce que voyait l'utilisateur.
 *
 * Ni « use client » ni état : le composant sert aussi bien dans un `loading.tsx`
 * rendu par le serveur que dans un composant client.
 */
export function PageLoading({
  label = "Chargement…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground",
        className
      )}
    >
      {/* `animate-spin` est neutralisé par le réglage système « moins d'animations » ;
          le libellé, lui, reste là et dit ce qui se passe. */}
      <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
