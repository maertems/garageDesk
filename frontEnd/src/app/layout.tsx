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

// Même variable que celle qui commande l'ordonnanceur du backend, lue dans le
// même deploy.env. Le front ne s'en sert que pour teinter le coin haut gauche :
// sur une instance de secours, on voit d'un coup d'œil qu'aucun rappel ne part
// d'ici. Les formes acceptées comme fausses sont celles du backend.
const remindersOff = ["0", "false", "no", "off", ""].includes(
  (process.env.SCHEDULER_ENABLED ?? "0").trim().toLowerCase()
);

export const metadata: Metadata = {
  title: `${appName} — Intranet`,
  description: "Gestion des rendez-vous garage",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <AppShell appName={appName} remindersOff={remindersOff}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
