import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson } from "@/lib/api";
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

export default async function LeavePage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  try {
    await apiJson("/api/v1/auth/me", cookie);
  } catch {
    redirect("/login");
  }
  let requests: LeaveRequest[] = [];
  try {
    const data = await apiJson<LeaveRequest[]>("/api/v1/leaveRequests", cookie);
    requests = Array.isArray(data) ? data : [];
  } catch {
    //
  }
  return <LeaveRequestsList initialRequests={requests} />;
}
