"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import { documentTypeLabels } from "@/lib/labels";
import LineEditor, { emptyLine, type LineDraft } from "@/app/facturation/_components/LineEditor";
import ClientVehicleCards from "@/app/facturation/_components/ClientVehicleCards";
import ClientFormModal from "@/app/clients/ClientFormModal";
import VehicleFormModal from "@/app/vehicles/VehicleFormModal";

type Vehicle = { id: number; licensePlate: string; brand?: string; model?: string };
type Client = { id: number; firstName: string | null; lastName: string; vehicles?: Vehicle[] };

type HeaderInfo = {
  id: number;
  clientId: number;
  vehicleId: number;
  kilometrage: number | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleLicensePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
};

type ParentDoc = {
  id: number;
  documentNumber: string;
  documentType: string;
  clientId: number | null;
  vehicleId: number | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  vehicleLicensePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
};

const ROOT_TYPES = ["repairOrder", "quote", "counterSale"] as const;

export default function NewDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const headerIdParam = searchParams.get("headerId");
  const parentDocumentIdParam = searchParams.get("parentDocumentId");

  const isAmendment = typeParam === "quoteAmendment";
  const [docType, setDocType] = useState<string>(
    typeParam && (ROOT_TYPES as readonly string[]).includes(typeParam) ? typeParam : "quote"
  );

  const [header, setHeader] = useState<HeaderInfo | null>(null);
  const [parentDoc, setParentDoc] = useState<ParentDoc | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [kilometrage, setKilometrage] = useState("");

  const [lines, setLines] = useState<LineDraft[]>([emptyLine(0)]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newVehicleOpen, setNewVehicleOpen] = useState(false);

  useEffect(() => {
    if (headerIdParam) {
      fetch(`/api/proxy/headers/${headerIdParam}`).then((r) => r.json()).then(setHeader).catch(() => {});
    }
    if (parentDocumentIdParam) {
      fetch(`/api/proxy/documents/${parentDocumentIdParam}`).then((r) => r.json()).then(setParentDoc).catch(() => {});
    }
    if (!headerIdParam && !parentDocumentIdParam) {
      fetch("/api/proxy/clients?withVehicles=true")
        .then((r) => r.json())
        .then((d) => setClients(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [headerIdParam, parentDocumentIdParam]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const filteredClients = useMemo(() => {
    if (clientSearch.trim().length < 2) return [];
    const q = clientSearch.toLowerCase();
    return clients
      .filter((c) => `${c.lastName} ${c.firstName ?? ""}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [clients, clientSearch]);

  function selectClient(c: Client) {
    setClientId(c.id);
    setClientSearch(`${c.lastName.toUpperCase()} ${c.firstName ?? ""}`.trim());
    setClientOpen(false);
    setVehicleId(c.vehicles?.[0]?.id ?? null);
  }

  function onClientCreated(record: Record<string, unknown>) {
    const c: Client = {
      id: record.id as number,
      firstName: (record.firstName as string) ?? null,
      lastName: record.lastName as string,
      vehicles: [],
    };
    setClients((prev) => [c, ...prev]);
    setNewClientOpen(false);
    selectClient(c);
  }

  function onVehicleCreated(record: Record<string, unknown>) {
    const v: Vehicle = {
      id: record.id as number,
      licensePlate: record.licensePlate as string,
      brand: record.brand as string | undefined,
      model: record.model as string | undefined,
    };
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, vehicles: [...(c.vehicles ?? []), v] } : c)));
    setNewVehicleOpen(false);
    setVehicleId(v.id);
  }

  async function handleCreate() {
    setError("");

    const body: Record<string, unknown> = { documentType: isAmendment ? "quoteAmendment" : docType };
    if (isAmendment) {
      if (!parentDocumentIdParam) {
        setError("Devis parent manquant.");
        return;
      }
      body.parentDocumentId = Number(parentDocumentIdParam);
    } else if (header) {
      body.headerId = header.id;
    } else {
      if (!clientId || !vehicleId) {
        setError("Sélectionnez un client et un véhicule.");
        return;
      }
      body.clientId = clientId;
      body.vehicleId = vehicleId;
      if (kilometrage) body.kilometrage = Number(kilometrage);
    }

    setSaving(true);
    const r = await fetch("/api/proxy/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de la création.");
      setSaving(false);
      return;
    }
    const created = await r.json();

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
    const r2 = await fetch(`/api/proxy/documents/${created.id}/lines`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: linesPayload, globalDiscountPercent: globalDiscount }),
    });
    setSaving(false);
    if (!r2.ok) {
      const d = await r2.json().catch(() => ({}));
      await fetch(`/api/proxy/documents/${created.id}`, { method: "DELETE" }).catch(() => {});
      setError(d.detail?.message ?? d.message ?? "Erreur lors de la sauvegarde des lignes.");
      return;
    }
    router.push(`/facturation/documents/${created.id}`);
  }

  // Contexte figé (avenant ou entête réutilisée) : client/véhicule non modifiables ici.
  const hasFixedContext = isAmendment || header != null;
  const fixedClientId = isAmendment ? (parentDoc?.clientId ?? null) : (header?.clientId ?? null);
  const fixedVehicleId = isAmendment ? (parentDoc?.vehicleId ?? null) : (header?.vehicleId ?? null);

  return (
    <>
      <PageHeader
        title={isAmendment ? `Nouvel avenant${parentDoc ? ` — ${parentDoc.documentNumber}` : ""}` : "Nouveau document"}
        back={{ href: "/facturation", label: "Documents" }}
      />
      <PageBody>
        {!isAmendment && !headerIdParam && (
          <div className="mb-6">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Type de document</p>
            <div className="flex gap-2">
              {ROOT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setDocType(t)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    docType === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {documentTypeLabels[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasFixedContext ? (
          <div className="mb-6">
            <ClientVehicleCards clientId={fixedClientId} vehicleId={fixedVehicleId} intakeKilometrage={header?.kilometrage} />
          </div>
        ) : (
          !isAmendment && (
            <div className="rounded-lg border bg-card p-4 mb-6 space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Client et véhicule</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-2">
                  <div className="relative flex-1 min-w-0">
                    <Input
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setClientOpen(true);
                        setClientId(null);
                      }}
                      onFocus={() => setClientOpen(clientSearch.trim().length >= 2)}
                      placeholder="Rechercher un client (min. 2 caractères)"
                    />
                    {clientOpen && filteredClients.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
                        {filteredClients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectClient(c);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          >
                            {c.lastName.toUpperCase()} {c.firstName ?? ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" size="icon" onClick={() => setNewClientOpen(true)} aria-label="Nouveau client">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={vehicleId ?? ""}
                    onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : null)}
                    disabled={!selectedClient}
                    className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50"
                  >
                    <option value="">— Véhicule —</option>
                    {selectedClient?.vehicles?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {[v.brand, v.model].filter(Boolean).join(" ")
                          ? `${[v.brand, v.model].filter(Boolean).join(" ")} - ${v.licensePlate}`
                          : v.licensePlate}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!selectedClient}
                    onClick={() => setNewVehicleOpen(true)}
                    aria-label="Nouveau véhicule"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Input
                type="number"
                value={kilometrage}
                onChange={(e) => setKilometrage(e.target.value)}
                placeholder="Kilométrage (optionnel)"
                className="max-w-xs"
              />
            </div>
          )
        )}

        {!hasFixedContext && clientId && (
          <div className="mb-6">
            <ClientVehicleCards clientId={clientId} vehicleId={vehicleId} intakeKilometrage={kilometrage ? Number(kilometrage) : null} />
          </div>
        )}

        <LineEditor
          lines={lines}
          onChange={setLines}
          globalDiscountPercent={globalDiscount}
          onGlobalDiscountChange={setGlobalDiscount}
        />

        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </div>
      </PageBody>

      <ClientFormModal open={newClientOpen} onClose={() => setNewClientOpen(false)} onSaved={onClientCreated} />
      <VehicleFormModal
        open={newVehicleOpen}
        onClose={() => setNewVehicleOpen(false)}
        onSaved={onVehicleCreated}
        defaultClientId={clientId ?? undefined}
      />
    </>
  );
}
