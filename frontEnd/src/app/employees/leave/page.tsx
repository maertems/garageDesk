import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import LeaveRequestsList from "./LeaveRequestsList";

type LeaveRequest = {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  status: string;
  employeeFirstName?: string;
  employeeLastName?: string;
};

type Employee = { id: number; firstName: string; lastName: string };

export default async function LeavePage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  // Les salariés sont rendus ici, et non plus cherchés par le navigateur : le
  // formulaire de congé s'ouvrait sur une liste de salariés vide le temps de
  // l'appel.
  const [requests, employees] = await Promise.all([
    apiJson<LeaveRequest[]>("/api/v1/leaveRequests", cookie).catch(() => [] as LeaveRequest[]),
    apiJson<Employee[]>("/api/v1/employees", cookie).catch(() => [] as Employee[]),
  ]);

  return (
    <LeaveRequestsList
      initialRequests={Array.isArray(requests) ? requests : []}
      initialEmployees={Array.isArray(employees) ? employees : []}
    />
  );
}
