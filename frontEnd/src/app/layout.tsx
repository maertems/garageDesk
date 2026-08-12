import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/layout/AppShell";

// Nom configurable via la variable d'environnement APP_NAME (lue côté
// serveur au démarrage, donc modifiable sans reconstruire l'image Docker).
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
