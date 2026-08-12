import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import EmployeeForm from "../EmployeeForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default async function EmployeeEditPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  type Employee = { id: number; firstName: string; lastName: string; category: string };
  let employee: Employee | null = null;
  try {
    employee = await apiJson<Employee>("/api/v1/employees/" + id, cookie);
  } catch {
    notFound();
  }
  return (
    <>
      <PageHeader
        title={`${employee?.lastName ?? ""} ${employee?.firstName ?? ""}`.trim() || "Salarié"}
        back={{ href: "/employees", label: "Salariés" }}
      />
      <PageBody>
        <div className="max-w-2xl">
          <EmployeeForm initial={employee} />
        </div>
      </PageBody>
    </>
  );
}
