"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs: { href: string; label: string; exact?: boolean }[] = [
  { href: "/settings", label: "Calendrier", exact: true },
  { href: "/settings/facturation", label: "Facturation" },
  { href: "/settings/vehicules-pret", label: "Véhicules de prêt" },
  { href: "/settings/entreprise", label: "Entreprise" },
];

export default function SettingsTabs() {
  const pathname = usePathname();

  const isActive = (t: (typeof tabs)[number]) =>
    t.exact ? pathname === t.href : pathname === t.href || pathname?.startsWith(t.href + "/");

  return (
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
  );
}
