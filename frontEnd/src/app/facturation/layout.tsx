"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Sous-navigation interne du module Facturation.
// "Documents" couvre la liste unifiée (/facturation) ET les pages de
// création/détail d'un document (/facturation/documents/...), sans quoi
// startsWith("/facturation/") capturerait aussi Factures/Avoirs/etc.
const tabs: { href: string; label: string; exact?: boolean; extraPrefix?: string }[] = [
  { href: "/facturation", label: "Documents", exact: true, extraPrefix: "/facturation/documents" },
  { href: "/facturation/factures", label: "Factures" },
  { href: "/facturation/avoirs", label: "Avoirs" },
];

export default function FacturationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (t: (typeof tabs)[number]) => {
    if (t.extraPrefix && pathname?.startsWith(t.extraPrefix)) return true;
    return t.exact ? pathname === t.href : pathname === t.href || pathname?.startsWith(t.href + "/");
  };

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="flex items-center gap-1 border-b bg-card px-6 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              isActive(t)
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1">{children}</div>
    </div>
  );
}
