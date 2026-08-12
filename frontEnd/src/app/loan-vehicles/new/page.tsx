import LoanVehicleForm from "../LoanVehicleForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default function NewLoanVehiclePage() {
  return (
    <>
      <PageHeader
        title="Nouveau véhicule de prêt"
        back={{ href: "/loan-vehicles", label: "Véhicules de prêt" }}
      />
      <PageBody>
        <div className="max-w-3xl">
          <LoanVehicleForm />
        </div>
      </PageBody>
    </>
  );
}
