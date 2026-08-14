import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

// Rendu à la requête, et non prérendu au build. Sans cela, Next.js fige le HTML
// des routes statiques (/login, /loan-vehicles, /vehicles…) pendant `npm run
// build` — c'est-à-dire dans le `docker build`, où APP_NAME n'existe pas encore,
// le `-e APP_NAME` n'arrivant qu'au `docker run`. La valeur de repli se
// retrouvait alors figée dans la page servie, titre de l'onglet compris.
export const dynamic = "force-dynamic";

// Nom configurable via la variable d'environnement APP_NAME (lue côté
// serveur à chaque requête, donc modifiable sans reconstruire l'image Docker).
const appName = process.env.APP_NAME || "GarageDesk";

export const metadata: Metadata = {
  title: `${appName} — Intranet`,
  description: "Gestion des rendez-vous garage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <AppShell appName={appName}>{children}</AppShell>
      </body>
    </html>
  );
}
