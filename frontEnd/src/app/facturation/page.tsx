import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiJson, verifierSession } from "@/lib/api";
import FacturationDocumentsList from "./FacturationDocumentsList";

export type UnifiedDocKind =
  | "repairOrder"
  | "quote"
  | "quoteAmendment"
  | "counterSale"
  | "invoice"
  | "creditNote";

export type UnifiedDocRow = {
  key: string;
  kind: UnifiedDocKind;
  id: number;
  number: string;
  date: string;
  parentRef: string | null;
  clientLastName: string | null;
  clientFirstName: string | null;
  vehicleLicensePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  totalTtc: number;
  status: string | null;
  href: string;
};

type DocumentListItem = {
  id: number;
  headerId: number | null;
  documentType: UnifiedDocKind;
  documentNumber: string;
  status: string;
  totalTtc: number;
  createdAt: string;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleLicensePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
};

type InvoiceListItem = {
  id: number;
  invoiceNumber: string;
  sourceQuoteId: number;
  sourceQuoteNumber: string | null;
  issuedAt: string;
  clientName: string | null;
  clientFirstName: string | null;
  vehicleLicensePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  totalTtc: number;
  paymentStatus: string;
};

type CreditNoteListItem = {
  id: number;
  creditNoteNumber: string;
  sourceInvoiceId: number;
  sourceInvoiceNumber: string | null;
  issuedAt: string;
  clientName: string | null;
  clientFirstName: string | null;
  vehicleLicensePlate: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  totalTtc: number;
};

export default async function FacturationPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.toString();
  // Session lancée sans être attendue : les appels de données partent en même
  // temps, et la redirection est décidée après eux (cf. verifierSession).
  const session = verifierSession(cookie);

  const [documents, invoices, creditNotes] = await Promise.all([
    apiJson<DocumentListItem[]>("/api/v1/documents", cookie).catch(() => []),
    apiJson<InvoiceListItem[]>("/api/v1/invoices", cookie).catch(() => []),
    apiJson<CreditNoteListItem[]>("/api/v1/creditNotes", cookie).catch(() => []),
  ]);

  const rows: UnifiedDocRow[] = [
    ...(Array.isArray(documents) ? documents : []).map((d): UnifiedDocRow => ({
      key: `doc-${d.id}`,
      kind: d.documentType,
      id: d.id,
      number: d.documentNumber,
      date: d.createdAt,
      parentRef: null,
      clientLastName: d.clientLastName,
      clientFirstName: d.clientFirstName,
      vehicleLicensePlate: d.vehicleLicensePlate,
      vehicleBrand: d.vehicleBrand,
      vehicleModel: d.vehicleModel,
      totalTtc: d.totalTtc,
      status: d.status,
      href: `/facturation/documents/${d.id}`,
    })),
    ...(Array.isArray(invoices) ? invoices : []).map((inv): UnifiedDocRow => ({
      key: `invoice-${inv.id}`,
      kind: "invoice",
      id: inv.id,
      number: inv.invoiceNumber,
      date: inv.issuedAt,
      parentRef: inv.sourceQuoteNumber,
      clientLastName: inv.clientName,
      clientFirstName: inv.clientFirstName,
      vehicleLicensePlate: inv.vehicleLicensePlate,
      vehicleBrand: inv.vehicleMake,
      vehicleModel: inv.vehicleModel,
      totalTtc: inv.totalTtc,
      status: inv.paymentStatus,
      href: `/facturation/factures/${inv.id}`,
    })),
    ...(Array.isArray(creditNotes) ? creditNotes : []).map((cn): UnifiedDocRow => ({
      key: `creditNote-${cn.id}`,
      kind: "creditNote",
      id: cn.id,
      number: cn.creditNoteNumber,
      date: cn.issuedAt,
      parentRef: cn.sourceInvoiceNumber,
      clientLastName: cn.clientName,
      clientFirstName: cn.clientFirstName,
      vehicleLicensePlate: cn.vehicleLicensePlate,
      vehicleBrand: cn.vehicleMake,
      vehicleModel: cn.vehicleModel,
      totalTtc: cn.totalTtc,
      status: null,
      href: `/facturation/avoirs/${cn.id}`,
    })),
  ];

  if (!(await session)) redirect("/login");

  return (
    <Suspense>
      <FacturationDocumentsList initialRows={rows} />
    </Suspense>
  );
}
