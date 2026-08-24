"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getLabel, clientTypeLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";

type ClientRecord = Record<string, unknown>;

type ClientFormProps = {
  initial?: ClientRecord | null;
  onSaved?: (client: ClientRecord) => void;
  onClose?: () => void;
};

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40 rounded-t-lg";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card";

const GENDERS = ["", "M.", "Mme"];

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-input hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function ClientForm({ initial, onSaved, onClose }: ClientFormProps) {
  const router = useRouter();
  const isModalMode = onSaved != null && onClose != null;

  const [gender, setGender] = useState((initial?.gender as string) ?? "");
  const [lastName, setLastName] = useState((initial?.lastName as string) ?? "");
  const [firstName, setFirstName] = useState((initial?.firstName as string) ?? "");
  const [phone, setPhone] = useState((initial?.phone as string) ?? "");
  const [email, setEmail] = useState((initial?.email as string) ?? "");
  const [address, setAddress] = useState((initial?.address as string) ?? "");
  const [postalCode, setPostalCode] = useState((initial?.postalCode as string) ?? "");
  const [city, setCity] = useState((initial?.city as string) ?? "");
  const [clientType, setClientType] = useState((initial?.clientType as string) ?? "individual");
  const [vatNumber, setVatNumber] = useState((initial?.vatNumber as string) ?? "");
  const [siren, setSiren] = useState((initial?.siren as string) ?? "");
  const [accountNumber, setAccountNumber] = useState((initial?.accountNumber as string) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const id = initial?.id as number | undefined;
  const isCompany = clientType === "company";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const body = {
      firstName: firstName || undefined,
      lastName,
      gender: gender || undefined,
      phone: phone || undefined,
      email: email || undefined,
      address: address || undefined,
      postalCode: postalCode || undefined,
      city: city || undefined,
      clientType,
      vatNumber: isCompany ? vatNumber || undefined : undefined,
      siren: isCompany ? siren || undefined : undefined,
      accountNumber: accountNumber || undefined,
    };
    const url = id ? `/api/proxy/clients/${id}` : "/api/proxy/clients";
    const method = id ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message || d.message || "Erreur");
      return;
    }
    const data = await res.json();
    if (isModalMode && onSaved) { onSaved(data); return; }
    router.push("/clients");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

      {/* Identité */}
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Identité</h3>
        </header>
        <div className="p-4 space-y-3">
          {/* Type */}
          <div className="flex gap-1">
            <SegBtn active={!isCompany} onClick={() => setClientType("individual")}>
              {getLabel(clientTypeLabels, "individual")}
            </SegBtn>
            <SegBtn active={isCompany} onClick={() => setClientType("company")}>
              {getLabel(clientTypeLabels, "company")}
            </SegBtn>
          </div>
          {/* Civilité + Nom / Prénom */}
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3">
            <div className="space-y-1.5">
              <Label>Civilité</Label>
              <div className="flex gap-1">
                {GENDERS.map((g) => (
                  <SegBtn key={g} active={gender === g} onClick={() => setGender(g)}>
                    {g || "—"}
                  </SegBtn>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom *</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
            <div className="flex items-center justify-end">
              <Label htmlFor="firstName" className={isCompany ? "text-muted-foreground" : ""}>Prénom</Label>
            </div>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isCompany}
              className={isCompany ? "bg-muted text-muted-foreground" : ""}
            />
          </div>
        </div>
      </section>

      {/* Coordonnées */}
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Coordonnées</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Code postal</Label>
              <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="59000" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lille" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {/* Hors de la section Entreprise à dessein : un particulier a un compte
              comptable comme une société, alors que N° TVA et SIREN n'ont de sens
              que pour une société. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="accountNumber">N° de compte</Label>
              <Input
                id="accountNumber"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="41101518"
              />
              <p className="text-xs text-muted-foreground">
                Numéro venu de votre comptabilité. Imprimé sur les factures et les avoirs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Entreprise */}
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Entreprise</h3>
        </header>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="vatNumber" className={!isCompany ? "text-muted-foreground" : ""}>N° TVA</Label>
            <Input
              id="vatNumber"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              disabled={!isCompany}
              className={!isCompany ? "bg-muted text-muted-foreground" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="siren" className={!isCompany ? "text-muted-foreground" : ""}>SIREN</Label>
            <Input
              id="siren"
              value={siren}
              onChange={(e) => setSiren(e.target.value)}
              disabled={!isCompany}
              className={!isCompany ? "bg-muted text-muted-foreground" : ""}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {isModalMode ? (
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {id ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {id ? "Enregistrer" : "Créer"}
          </Button>
          <Button asChild variant="outline"><Link href="/clients">Annuler</Link></Button>
        </div>
      )}
    </form>
  );
}
