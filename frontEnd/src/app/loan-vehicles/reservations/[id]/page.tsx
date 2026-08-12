"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function EditReservationRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id ? String(params.id) : null;
  useEffect(() => {
    if (id) router.replace(`/loan-vehicles?editReservation=${id}`);
  }, [router, id]);
  return <div className="page-container">Redirection…</div>;
}
