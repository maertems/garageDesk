import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import SettingsTabs from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let user: { role?: string } | null = null;
  try {
    user = await apiJson<{ role?: string }>("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  if (!user || user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <SettingsTabs />
      <div className="flex-1">{children}</div>
    </div>
  );
}
