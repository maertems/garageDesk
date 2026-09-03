import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import {
  HOUR_HEIGHT_ALLOWED_PX,
  HOUR_HEIGHT_DEFAULT_PX,
  SLOT_MINUTES_ALLOWED,
} from "@/lib/calendar-grid";
import CalendarView, { type Appointment } from "./calendar/CalendarView";

export default async function HomePage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

  // Période des rendez-vous rendus par le serveur : le mois courant élargi d'une
  // semaine de part et d'autre. La grille du client s'ouvre sur la semaine du
  // jour, qui peut chevaucher deux mois ; sans cette marge, les premiers ou les
  // derniers jours de la semaine affichée arriveraient vides puis se
  // rempliraient. Le client filtre ensuite jour par jour, un surplus est donc
  // sans conséquence. Bornes calculées en heure locale, comme celles que le
  // client envoie.
  const debutRdv = new Date(year, month - 1, 1, 0, 0, 0, 0);
  debutRdv.setDate(debutRdv.getDate() - 7);
  const finRdv = new Date(year, month, 0, 23, 59, 59, 999);
  finRdv.setDate(finRdv.getDate() + 7);

  // La session est vérifiée DANS le même lot que les données, et non avant : elle
  // était attendue seule, ce qui ajoutait un aller-retour complet à chaque
  // affichage — la page la plus coûteuse du site, avec ses six appels.
  const [session, settings, categories, statuses, leaveRequests, loanReservations, appointments] = await Promise.all([
    verifierSession(cookie),
    apiJson<{ key: string; value: string }[]>("/api/v1/settings", cookie).catch(() => []),
    apiJson<{ id: number; code: string; color: string }[]>("/api/v1/appointmentCategories", cookie).catch(() => []),
    apiJson<{ id: number; code: string; color: string }[]>("/api/v1/appointmentStatuses", cookie).catch(() => []),
    apiJson<LeaveRequest[]>(`/api/v1/leaveRequests?month=${month}&year=${year}`, cookie).catch(() => []),
    apiJson<LoanReservation[]>(`/api/v1/loanReservations?start=${startMonth}&end=${endMonth}`, cookie).catch(() => []),
    apiJson<Appointment[]>(
      `/api/v1/appointments?start=${debutRdv.toISOString()}&end=${finRdv.toISOString()}`,
      cookie
    ).catch(() => []),
  ]);

  if (!session) redirect("/login");

  const settingsMap: Record<string, string> = {};
  if (Array.isArray(settings)) settings.forEach((s) => (settingsMap[s.key] = s.value));
  const defaultView = settingsMap.calendarDefaultView || "week";
  const weekDays = Math.min(7, Math.max(5, parseInt(settingsMap.calendarWeekDays || "5", 10)));
  const dayStart = settingsMap.calendarDayStart || "08:00";
  const dayEnd = settingsMap.calendarDayEnd || "18:00";
  const allowedDurations = [15, 30, 60, 120, 240, 480];
  const parsedDuration = parseInt(settingsMap.calendarDefaultDurationMinutes || "15", 10);
  const defaultDurationMins = allowedDurations.includes(parsedDuration) ? parsedDuration : 15;
  // Découpage et hauteur de l'heure : validés ici, côté serveur, et non plus dans
  // le composant. Une valeur hors liste retombe sur le défaut — c'est le cas d'une
  // base où le réglage n'a jamais été enregistré.
  const parsedSlot = parseInt(settingsMap.calendarSlotMinutes || "15", 10);
  const slotMinutes = SLOT_MINUTES_ALLOWED.includes(parsedSlot) ? parsedSlot : 15;
  const parsedHourHeight = parseInt(settingsMap.calendarHourHeightPx || "", 10);
  const hourHeightPx = HOUR_HEIGHT_ALLOWED_PX.includes(parsedHourHeight)
    ? parsedHourHeight
    : HOUR_HEIGHT_DEFAULT_PX;

  return (
    <CalendarView
        initialView={defaultView}
        weekDays={weekDays}
        dayStart={dayStart}
        dayEnd={dayEnd}
        defaultDurationMins={defaultDurationMins}
        slotMinutes={slotMinutes}
        hourHeightPx={hourHeightPx}
        initialAppointments={Array.isArray(appointments) ? appointments : []}
        initialRangeStart={debutRdv.toISOString()}
        initialRangeEnd={finRdv.toISOString()}
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
