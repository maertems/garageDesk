import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import LoanVehicleForm from "../LoanVehicleForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

type LoanVehicle = {
  id: number;
  brand?: string;
  model?: string;
  licensePlate: string;
  mileage?: number;
  uniqueNumber: string;
};

export default async function LoanVehicleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  let vehicle: LoanVehicle | null = null;
  try {
    vehicle = await apiJson<LoanVehicle>(`/api/v1/loanVehicles/${id}`, cookie);
  } catch {
    notFound();
  }
  const title = [vehicle?.brand, vehicle?.model].filter(Boolean).join(" ") || vehicle?.uniqueNumber;
  return (
    <>
      <PageHeader
        title={title || "Véhicule de prêt"}
        description={`${vehicle?.uniqueNumber} — ${vehicle?.licensePlate}`}
        back={{ href: "/loan-vehicles", label: "Véhicules de prêt" }}
      />
      <PageBody>
        <div className="max-w-3xl">
          <LoanVehicleForm initial={vehicle} />
        </div>
      </PageBody>
    </>
  );
}
