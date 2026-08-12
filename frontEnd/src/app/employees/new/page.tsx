import EmployeeForm from "../EmployeeForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default function NewEmployeePage() {
  return (
    <>
      <PageHeader title="Nouveau salarié" back={{ href: "/employees", label: "Salariés" }} />
      <PageBody>
        <div className="max-w-2xl">
          <EmployeeForm />
        </div>
      </PageBody>
    </>
  );
}
