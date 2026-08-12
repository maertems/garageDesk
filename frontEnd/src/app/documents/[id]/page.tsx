import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { apiJson } from "@/lib/api";
import DocumentDetail from "./DocumentDetail";

type Bill = {
  id: number;
  billId: number;
  docId: number | null;
  docNum: number | null;
  vmodId: string | null;
  vehicleId: number | null;
  clientId: number;
  account: string | null;
  dateDoc: string | null;
  dateBill: string | null;
  type: string | null;
  status: string;
  notBilled: number | null;
};

type BillDetail = {
  id: number;
  billId: number;
  type: string | null;
  description: string | null;
  reference: string | null;
  time: number | null;
  timeEquivalentT1: number | null;
  priceHT: number | null;
  price: number | null;
  unitPrice: string | null;
  taxeType: string | null;
  taxe: number | null;
  cashBack: number | null;
};

type ClientInfo = {
  id: number;
  firstName: string | null;
  lastName: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  clientType: string;
};

type VehicleInfo = {
  id: number;
  licensePlate: string;
  brand: string | null;
  model: string | null;
  type: string | null;
  registrationDate: string | null;
  vin: string | null;
  mileage: number | null;
};

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();

  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }

  let bill: Bill | null = null;
  try {
    bill = await apiJson<Bill>(`/api/v1/bills/${id}`, cookie);
  } catch {
    notFound();
  }
  if (!bill) notFound();

  const [billDetails, client, vehicle] = await Promise.all([
    apiJson<BillDetail[]>(`/api/v1/billDetails?billId=${bill.billId}`, cookie).catch(() => [] as BillDetail[]),
    apiJson<ClientInfo>(`/api/v1/clients/${bill.clientId}`, cookie).catch(() => null),
    bill.vehicleId
      ? apiJson<VehicleInfo>(`/api/v1/vehicles/${bill.vehicleId}`, cookie).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <DocumentDetail
      bill={bill}
      billDetails={billDetails}
      client={client}
      vehicle={vehicle}
    />
  );
}
