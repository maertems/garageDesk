import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import CalendarView from "./calendar/CalendarView";

export default async function HomePage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  let ok = false;
  try {
    await apiJson("/api/v1/auth/me", cookie);
    ok = true;
  } catch {
    //
  }
  if (!ok) redirect("/login");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  const [settings, categories, statuses, leaveRequests, loanReservations] = await Promise.all([
    apiJson<{ key: string; value: string }[]>("/api/v1/settings", cookie).catch(() => []),
    apiJson<{ id: number; code: string; color: string }[]>("/api/v1/appointmentCategories", cookie).catch(() => []),
    apiJson<{ id: number; code: string; color: string }[]>("/api/v1/appointmentStatuses", cookie).catch(() => []),
    apiJson<LeaveRequest[]>(`/api/v1/leaveRequests?month=${month}&year=${year}`, cookie).catch(() => []),
    apiJson<LoanReservation[]>(`/api/v1/loanReservations?start=${startMonth}&end=${endMonth}`, cookie).catch(() => []),
  ]);

  const settingsMap: Record<string, string> = {};
  if (Array.isArray(settings)) settings.forEach((s) => (settingsMap[s.key] = s.value));
  const defaultView = settingsMap.calendarDefaultView || "week";
  const weekDays = Math.min(7, Math.max(5, parseInt(settingsMap.calendarWeekDays || "5", 10)));
  const dayStart = settingsMap.calendarDayStart || "08:00";
  const dayEnd = settingsMap.calendarDayEnd || "18:00";
  const allowedDurations = [15, 30, 60, 120, 240, 480];
  const parsedDuration = parseInt(settingsMap.calendarDefaultDurationMinutes || "15", 10);
  const defaultDurationMins = allowedDurations.includes(parsedDuration) ? parsedDuration : 15;

  return (
    <CalendarView
        initialView={defaultView}
        weekDays={weekDays}
        dayStart={dayStart}
        dayEnd={dayEnd}
        defaultDurationMins={defaultDurationMins}
        categories={categories}
        statuses={statuses}
        leaveRequests={Array.isArray(leaveRequests) ? leaveRequests : []}
        loanReservations={Array.isArray(loanReservations) ? loanReservations : []}
    />
  );
}

type LeaveRequest = {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  status: string;
  employeeFirstName?: string;
  employeeLastName?: string;
};

type LoanReservation = {
  id: number;
  loanVehicleId: number;
  clientId: number;
  startDate: string;
  endDate: string;
  loanVehicleUniqueNumber?: string;
  clientFirstName?: string;
  clientLastName?: string;
};
