"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar, { SIDEBAR_COLLAPSED_EVENT, SIDEBAR_COLLAPSED_KEY, type SidebarUser } from "./Sidebar";

export default function AppShell({
  children,
  appName,
  remindersOff = false,
  user = null,
}: {
  children: React.ReactNode;
  appName: string;
  remindersOff?: boolean;
  user?: SidebarUser | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // La barre latérale et ce cadre lisent le même réglage. Il était relu toutes
  // les 300 ms par un minuteur ; la barre signale maintenant chaque bascule par
  // un événement, et l'autre onglet par `storage`.
  useEffect(() => {
    const read = () => {
      try {
        setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
      } catch {
        // stockage indisponible : on reste déplié
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SIDEBAR_COLLAPSED_EVENT, read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, read);
    };
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar appName={appName} remindersOff={remindersOff} user={user} />
      <main
        className="flex-1 transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: collapsed ? 68 : 232 }}
      >
        {children}
      </main>
    </div>
  );
}
