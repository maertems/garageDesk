"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewReservationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/loan-vehicles?newReservation=1");
  }, [router]);
  return <div className="page-container">Redirection…</div>;
}
