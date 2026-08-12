import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import EmployeesList from "./EmployeesList";

type Employee = { id: number; firstName: string; lastName: string; category: string };

export default async function EmployeesPage() {
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
  let employees: Employee[] = [];
  try {
    const data = await apiJson<Employee[]>("/api/v1/employees", cookie);
    employees = Array.isArray(data) ? data : [];
  } catch {
    //
  }
  return <EmployeesList initialEmployees={employees} />;
}
