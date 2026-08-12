"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Trash2, PenLine, Plus, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { documentTypeLabels, documentStatusLabels, getLabel } from "@/lib/labels";
import LineEditor, { emptyLine, type LineDraft } from "@/app/facturation/_components/LineEditor";
import ClientVehicleCards from "@/app/facturation/_components/ClientVehicleCards";
import SignatureModal from "./SignatureModal";

export type BillingLine = {
  id?: number;
  sortOrder: number;
  lineType: string | null;
  articleId: number | null;
  label: string;
  longDescription: string | null;
  quantity: number;
  unitCode: string | null;
  unitPriceHt: number;
  discountPercent: number;
  discountAmount?: number;
  vatRate: number;
  facturXVatCategory: string;
  totalHt?: number;
  totalVat?: number;
  totalTtc?: number;
};

export type BillingDocument = {
  id: number;
  headerId: number | null;
  parentDocumentId: number | null;
  documentType: "repairOrder" | "quote" | "quoteAmendment" | "counterSale";
  documentNumber: string;
  status: "draft" | "issued" | "signed" | "refused" | "expired" | "obsolete";
  validUntil: string | null;
  totalHt: number;
  totalVat: number;
  totalTtc: number;
  globalDiscountPercent: number;
  signatureId: number | null;
  createdAt: string;
  lines: BillingLine[];
  clientId: number | null;
  vehicleId: number | null;
  kilometrage: number | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleLicensePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
};

type SiblingDocument = {
  id: number;
  documentType: string;
  documentNumber: string;
  status: string;
};

type InvoiceRef = { id: number; invoiceNumber: string };

const DOC_STATUS_COLORS: Record<string, string> = {
  draft: "border-gray-300 text-gray-600",
  issued: "border-yellow-300 text-yellow-700 bg-yellow-50",
  signed: "border-green-300 text-green-700 bg-green-50",
  refused: "border-red-300 text-red-700 bg-red-50",
  expired: "border-orange-300 text-orange-700 bg-orange-50",
  obsolete: "border-gray-300 text-gray-400 bg-gray-50 opacity-60",
};

function lineToDraft(l: BillingLine, idx: number): LineDraft {
  return {
    id: l.id,
    sortOrder: l.sortOrder ?? idx,
    lineType: l.lineType,
    articleId: l.articleId,
    label: l.label,
    longDescription: l.longDescription,
    quantity: l.quantity,
    unitCode: l.unitCode,
    unitPriceHt: l.unitPriceHt,
    discountPercent: l.discountPercent,
    vatRate: l.vatRate,
    facturXVatCategory: l.facturXVatCategory ?? "S",
  };
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DocumentDetail({ initialDocument }: { initialDocument: BillingDocument }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDocument);
  const isDraft = doc.status === "draft";

  const [lines, setLines] = useState<LineDraft[]>(() =>
    doc.lines.length > 0 ? doc.lines.map(lineToDraft) : [emptyLine(0)]
  );
  const [globalDiscount, setGlobalDiscount] = useState(doc.globalDiscountPercent ?? 0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [error, setError] = useState("");
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [siblings, setSiblings] = useState<SiblingDocument[]>([]);
  const [parentQuote, setParentQuote] = useState<SiblingDocument | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRef | null>(null);

  const clientLabel = [doc.clientLastName?.toUpperCase(), doc.clientFirstName].filter(Boolean).join(" ") || "—";
  const vehicleLabel = [doc.vehicleLicensePlate, doc.vehicleBrand, doc.vehicleModel].filter(Boolean).join(" — ") || "—";

  useEffect(() => {
    if (doc.documentType === "quoteAmendment" && doc.parentDocumentId) {
      fetch(`/api/proxy/documents/${doc.parentDocumentId}`)
        .then((r) => r.json())
        .then((d) => setParentQuote({ id: d.id, documentType: d.documentType, documentNumber: d.documentNumber, status: d.status }))
        .catch(() => {});
    } else if (doc.headerId) {
      fetch(`/api/proxy/documents?headerId=${doc.headerId}`)
        .then((r) => r.json())
        .then((rows: SiblingDocument[]) => setSiblings(Array.isArray(rows) ? rows.filter((r) => r.id !== doc.id) : []))
        .catch(() => {});
    }
    if (doc.documentType === "quote") {
      fetch(`/api/proxy/invoices?sourceQuoteId=${doc.id}`)
        .then((r) => r.json())
        .then((rows: InvoiceRef[]) => setInvoice(Array.isArray(rows) && rows.length > 0 ? rows[0] : null))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  async function handleSave() {
    setError("");
    setSaving(true);

    const linesPayload = lines.map((l, i) => ({
      sortOrder: i,
      lineType: l.lineType,
      articleId: l.articleId,
      label: l.label,
      longDescription: l.longDescription,
      quantity: l.quantity,
      unitCode: l.unitCode,
      unitPriceHt: l.unitPriceHt,
      discountPercent: l.discountPercent,
      vatRate: l.vatRate,
      facturXVatCategory: l.facturXVatCategory,
    }));

    const r = await fetch(`/api/proxy/documents/${doc.id}/lines`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: linesPayload, globalDiscountPercent: globalDiscount }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de la sauvegarde.");
      return;
    }
    setDoc(await r.json());
  }

  async function handleIssue() {
    const r = await fetch(`/api/proxy/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "issued" }),
    });
    if (r.ok) setDoc(await r.json());
  }

  async function handleDelete() {
    if (!confirm(`Supprimer le document ${doc.documentNumber} ?`)) return;
    setDeleting(true);
    const r = await fetch(`/api/proxy/documents/${doc.id}`, { method: "DELETE" });
    setDeleting(false);
    if (r.ok || r.status === 204) router.push("/facturation");
  }

  async function handleIssueInvoice() {
    setIssuingInvoice(true);
    setError("");
    const r = await fetch("/api/proxy/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceQuoteId: doc.id }),
    });
    setIssuingInvoice(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de l'émission de la facture.");
      return;
    }
    const created = await r.json();
    router.push(`/facturation/factures/${created.id}`);
  }

  function onSigned(updatedDoc: BillingDocument) {
    setDoc(updatedDoc);
    setSigModalOpen(false);
  }

  const canCreateAmendment = doc.documentType === "quote" && doc.status === "signed";
  const canIssueInvoice = doc.documentType === "quote" && doc.status === "signed" && !invoice;
  const canCreateQuoteFromHere = doc.documentType === "repairOrder" && doc.headerId != null;

  return (
    <>
      <PageHeader
        title={doc.documentNumber}
        description={`${getLabel(documentTypeLabels, doc.documentType)} — ${clientLabel} — ${vehicleLabel}`}
        back={{ href: "/facturation", label: "Documents" }}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-sm ${DOC_STATUS_COLORS[doc.status] ?? ""}`}>
              {getLabel(documentStatusLabels, doc.status)}
            </Badge>
            {isDraft && (
              <>
                <Button variant="outline" size="sm" onClick={handleIssue}>Émettre</Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </Button>
              </>
            )}
            {doc.status === "issued" && !doc.signatureId && (
              <Button variant="outline" size="sm" onClick={() => setSigModalOpen(true)}>
                <PenLine className="h-4 w-4" />
                Signer
              </Button>
            )}
            {canCreateAmendment && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/facturation/documents/new?type=quoteAmendment&parentDocumentId=${doc.id}`}>
                  <Plus className="h-4 w-4" />
                  Créer un avenant
                </Link>
              </Button>
            )}
            {canCreateQuoteFromHere && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/facturation/documents/new?type=quote&headerId=${doc.headerId}`}>
                  <Plus className="h-4 w-4" />
                  Créer un devis
                </Link>
              </Button>
            )}
            {canIssueInvoice && (
              <Button size="sm" onClick={handleIssueInvoice} disabled={issuingInvoice}>
                {issuingInvoice && <Loader2 className="h-4 w-4 animate-spin" />}
                <ReceiptText className="h-4 w-4" />
                Émettre la facture
              </Button>
            )}
          </div>
        }
      />
      <PageBody>
        {/* Client + véhicule — même présentation que /documents/[id] */}
        <div className="mb-6">
          <ClientVehicleCards clientId={doc.clientId} vehicleId={doc.vehicleId} intakeKilometrage={doc.kilometrage} />
        </div>

        {/* Related documents */}
        {(parentQuote || siblings.length > 0 || invoice) && (
          <div className="rounded-lg border bg-card p-4 mb-6 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Documents liés :</span>
            {parentQuote && (
              <Link href={`/facturation/documents/${parentQuote.id}`} className="text-primary hover:underline">
                Devis {parentQuote.documentNumber}
              </Link>
            )}
            {siblings.map((s) => (
              <Link key={s.id} href={`/facturation/documents/${s.id}`} className="text-primary hover:underline">
                {getLabel(documentTypeLabels, s.documentType)} {s.documentNumber}
              </Link>
            ))}
            {invoice && (
              <Link href={`/facturation/factures/${invoice.id}`} className="text-primary hover:underline">
                Facture {invoice.invoiceNumber}
              </Link>
            )}
          </div>
        )}

        {/* Lines */}
        <LineEditor
          lines={lines}
          onChange={setLines}
          globalDiscountPercent={globalDiscount}
          onGlobalDiscountChange={setGlobalDiscount}
          readOnly={!isDraft}
        />

        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {isDraft && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        )}
      </PageBody>

      <SignatureModal
        open={sigModalOpen}
        onClose={() => setSigModalOpen(false)}
        onSigned={onSigned}
        documentId={doc.id}
        documentType={doc.documentType}
        documentNumber={doc.documentNumber}
      />
    </>
  );
}
