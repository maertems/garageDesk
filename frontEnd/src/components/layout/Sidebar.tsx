"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  Users,
  Car,
  CalendarOff,
  KeyRound,
  Shield,
  LogOut,
  Settings,
  ChevronLeft,
  ChevronRight,
  Wrench,
  FileText,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavLink = {
  href: string;
  label: string;
  icon: typeof Calendar;
  matchPrefix?: string;
  adminOnly?: boolean;
};

const group1: NavLink[] = [
  { href: "/", label: "Accueil", icon: Calendar },
  { href: "/documents", label: "Documents", icon: FileText, matchPrefix: "/documents" },
  { href: "/loan-vehicles", label: "Véhicules de prêt", icon: KeyRound, matchPrefix: "/loan-vehicles" },
];

const groupBilling: NavLink[] = [
  { href: "/facturation", label: "Facturation", icon: ReceiptText, matchPrefix: "/facturation" },
];

const group2: NavLink[] = [
  { href: "/clients", label: "Clients", icon: Users, matchPrefix: "/clients" },
  { href: "/vehicles", label: "Véhicules", icon: Car, matchPrefix: "/vehicles" },
];

const group3: NavLink[] = [
  { href: "/employees/leave", label: "Congés", icon: CalendarOff, matchPrefix: "/employees/leave" },
  { href: "/settings", label: "Paramètres", icon: Settings, matchPrefix: "/settings", adminOnly: true },
  { href: "/admin", label: "Admin", icon: Shield, matchPrefix: "/admin", adminOnly: true },
];

const atelierLink: NavLink = { href: "/atelier", label: "Atelier", icon: Wrench, matchPrefix: "/atelier" };

export default function Sidebar({ appName }: { appName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/proxy/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setRole(data?.role ?? null);
        setLogin(data?.login ?? null);
      })
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("sidebar:collapsed") : null;
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const v = !c;
      if (typeof window !== "undefined") localStorage.setItem("sidebar:collapsed", v ? "1" : "0");
      return v;
    });
  };

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (link: NavLink) => {
    if (link.matchPrefix) return pathname === link.href || pathname?.startsWith(link.matchPrefix + "/") || pathname === link.matchPrefix;
    return pathname === link.href;
  };

  function NavItem({ link }: { link: NavLink }) {
    const active = isActive(link);
    const Icon = link.icon;
    return (
      <li>
        <Link
          href={link.href}
          title={collapsed ? link.label : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            collapsed && "justify-center px-0",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{link.label}</span>}
        </Link>
      </li>
    );
  }

  const visibleGroup3 = group3.filter((l) => !l.adminOnly || role === "admin");

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex flex-col border-r bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-[68px]" : "w-[232px]"
      )}
    >
      <div className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            {appName.charAt(0).toUpperCase()}
          </div>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              {appName.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">{appName}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intranet</span>
            </div>
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        <ul className="space-y-1">
          {group1.map((link) => <NavItem key={link.href} link={link} />)}
          <li className="my-1 border-t border-border/50" />
          {groupBilling.map((link) => <NavItem key={link.href} link={link} />)}
          <li className="my-1 border-t border-border/50" />
          {group2.map((link) => <NavItem key={link.href} link={link} />)}
          {visibleGroup3.length > 0 && (
            <>
              <li className="my-1 border-t border-border/50" />
              {visibleGroup3.map((link) => <NavItem key={link.href} link={link} />)}
            </>
          )}
        </ul>
      </nav>

      <div className="px-3 pb-2">
        <ul>
          <NavItem link={atelierLink} />
        </ul>
      </div>

      <div className="border-t p-3">
        {!collapsed && login && (
          <div className="mb-2 flex items-center gap-2 px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
              {login.slice(0, 2)}
            </div>
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="text-sm font-medium truncate">{login}</span>
              <span className="text-xs text-muted-foreground capitalize">{role ?? ""}</span>
            </div>
          </div>
        )}
        <div className={cn("flex gap-1", collapsed && "flex-col")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={handleLogout}
            className={cn("text-muted-foreground hover:text-foreground", !collapsed && "flex-1 justify-start")}
            title="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Déconnexion</span>}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className="text-muted-foreground"
            title={collapsed ? "Étendre" : "Réduire"}
            aria-label={collapsed ? "Étendre la barre latérale" : "Réduire la barre latérale"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}
