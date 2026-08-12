import VehicleForm from "../VehicleForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default function NewVehiclePage() {
  return (
    <>
      <PageHeader title="Nouveau véhicule" back={{ href: "/vehicles", label: "Véhicules" }} />
      <PageBody>
        <div className="max-w-3xl">
          <VehicleForm />
        </div>
      </PageBody>
    </>
  );
}
