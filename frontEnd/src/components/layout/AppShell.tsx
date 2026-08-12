"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children, appName }: { children: React.ReactNode; appName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const read = () => {
      const stored = typeof window !== "undefined" ? localStorage.getItem("sidebar:collapsed") : null;
      setCollapsed(stored === "1");
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sidebar:collapsed") read();
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(read, 300);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar appName={appName} />
      <main
        className="flex-1 transition-[padding] duration-200 ease-out"
        style={{ paddingLeft: collapsed ? 68 : 232 }}
      >
        {children}
      </main>
    </div>
  );
}
