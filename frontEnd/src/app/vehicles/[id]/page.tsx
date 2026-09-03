import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import VehicleForm from "../VehicleForm";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

export default async function VehicleEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);
  type Vehicle = {
    id: number;
    clientId: number;
    brand?: string;
    model?: string;
    licensePlate: string;
    vin?: string;
    mileage?: number;
  };
  let vehicle: Vehicle | null = null;
  try {
    vehicle = await apiJson<Vehicle>("/api/v1/vehicles/" + id, cookie);
  } catch {
    notFound();
  }
  const title = [vehicle?.brand, vehicle?.model].filter(Boolean).join(" ");
  if (!(await session)) redirect("/login");

  return (
    <>
      <PageHeader
        title={title || vehicle?.licensePlate || "Véhicule"}
        description={vehicle?.licensePlate}
        back={{ href: "/vehicles", label: "Véhicules" }}
      />
      <PageBody>
        <div className="max-w-3xl">
          <VehicleForm initial={vehicle} />
        </div>
      </PageBody>
    </>
  );
}
