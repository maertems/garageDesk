import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, KeyRound, ScrollText, Settings as SettingsIcon, UsersRound } from "lucide-react";
import { apiJson } from "@/lib/api";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

const adminLinks = [
  {
    href: "/employees",
    title: "Personnel",
    description: "Gestion des salariés et catégories",
    icon: UsersRound,
  },
  {
    href: "/loan-vehicles",
    title: "Véhicules de prêt",
    description: "Flotte et réservations",
    icon: KeyRound,
  },
  {
    href: "/admin/notifications",
    title: "Notifications",
    description: "Email, SMS, templates et rappels",
    icon: Bell,
  },
  {
    href: "/admin/logs",
    title: "Journaux",
    description: "Notifications, synchronisation et actions",
    icon: ScrollText,
  },
  {
    href: "/settings",
    title: "Paramètres",
    description: "Calendrier et configuration générale",
    icon: SettingsIcon,
  },
];

export default async function AdminPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let user: { id: number; login: string; role: string } | null = null;
  try {
    user = await apiJson<{ id: number; login: string; role: string }>("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  if (!user || user.role !== "admin") {
    redirect("/");
  }
  return (
    <>
      <PageHeader
        title="Administration"
        description="Accès réservé aux dirigeants"
      />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {adminLinks.map(({ href, title, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border bg-card p-5 shadow-card hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold group-hover:text-primary transition-colors">
                  {title}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
