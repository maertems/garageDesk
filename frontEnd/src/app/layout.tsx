import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";
import { apiJson } from "@/lib/api";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // L'utilisateur connecté, pour le menu de gauche. La barre latérale le
  // demandait elle-même au navigateur, à chaque page : un aller-retour de plus
  // par navigation, et les entrées réservées aux administrateurs apparaissaient
  // après coup. Même appel que `verifierSession` dans les pages : Next ne le fait
  // qu'une fois par requête. Sans session (page de connexion), `null`.
  const cookie = (await cookies()).toString();
  const user = await apiJson<{ login: string; role: string }>("/api/v1/auth/me", cookie).catch(
    () => null
  );
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <AppShell appName={appName} remindersOff={remindersOff} user={user}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
