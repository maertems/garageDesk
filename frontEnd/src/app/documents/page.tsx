import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
import DocumentsList from "./DocumentsList";

export type BillListItem = {
  id: number;
  billId: number;
  docNum: number | null;
  dateDoc: string | null;
  type: string | null;
  status: string;
  vehicleId: number | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleLicensePlate: string | null;
  clientId: number;
  clientFirstName: string | null;
  clientLastName: string | null;
};

export default async function DocumentsPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  let bills: BillListItem[] = [];
  try {
    const data = await apiJson<BillListItem[]>("/api/v1/bills", cookie);
    bills = Array.isArray(data) ? data : [];
  } catch {
    //
  }
  return (
    <Suspense>
      <DocumentsList initialBills={bills} />
    </Suspense>
  );
}
