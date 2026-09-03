import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
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
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  // Les salariés sont rendus ici, et non plus cherchés par le navigateur : le
  // formulaire de congé s'ouvrait sur une liste de salariés vide le temps de
  // l'appel.
  const [requests, employees] = await Promise.all([
    apiJson<LeaveRequest[]>("/api/v1/leaveRequests", cookie).catch(() => [] as LeaveRequest[]),
    apiJson<Employee[]>("/api/v1/employees", cookie).catch(() => [] as Employee[]),
  ]);

  if (!(await session)) redirect("/login");

  return (
    <LeaveRequestsList
      initialRequests={Array.isArray(requests) ? requests : []}
      initialEmployees={Array.isArray(employees) ? employees : []}
    />
  );
}
