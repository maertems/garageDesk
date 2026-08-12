import { Suspense } from "react";
import LoanVehiclesSection from "./LoanVehiclesSection";

export default function LoanVehiclesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Chargement…</div>}>
      <LoanVehiclesSection />
    </Suspense>
  );
}
