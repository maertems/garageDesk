import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import AtelierView from "./AtelierView";
import { startOfWeek, format } from "date-fns";

export type WorkshopCar = {
  vehicleId: number;
  brand: string | null;
  model: string | null;
  type: string | null;
  licensePlate: string | null;
  clientId: number;
  clientFirstName: string | null;
  clientLastName: string | null;
  latestDocDate: string | null;
  latestDocType: string | null;
};

export type PlanningEntry = {
  id: number;
  vehicleId: number;
  planDate: string;
  appointmentId: number | null;
  appointmentStartTime: string | null;
  brand: string | null;
  model: string | null;
  licensePlate: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
};

export default async function AtelierPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekStart = format(monday, "yyyy-MM-dd");

  let cars: WorkshopCar[] = [];
  let planning: PlanningEntry[] = [];

  try {
    cars = await apiJson<WorkshopCar[]>("/api/v1/workshopCarsAvailable", cookie);
  } catch {}

  try {
    planning = await apiJson<PlanningEntry[]>(
      `/api/v1/workshopPlanning?weekStart=${weekStart}`,
      cookie
    );
  } catch {}

  return <AtelierView initialCars={cars} initialPlanning={planning} initialWeekStart={weekStart} />;
}
