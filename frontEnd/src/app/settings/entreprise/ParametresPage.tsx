"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import CompanyLogoSection from "./CompanyLogoSection";

type CompanySettings = {
  id: number;
  name: string;
  shareCapital: number | null;
  siren: string | null;
  siretHeadquarters: string | null;
  rcsCity: string | null;
  vatIntracom: string | null;
  nafCode: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  phone: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
  mediatorName: string | null;
  mediatorUrl: string | null;
  mediatorAddress: string | null;
  vatExemption: boolean;
  hasLogo: boolean;
  missingMandatoryFields: string[];
};

const MANDATORY_LABELS: Record<string, string> = {
  name: "Raison sociale",
  siren: "SIREN",
  siretHeadquarters: "SIRET siège",
  rcsCity: "Ville RCS",
  addressLine1: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  mediatorName: "Médiateur",
  mediatorUrl: "URL médiateur",
  vatIntracom: "N° TVA intracommunautaire",
};

const SECTION = "rounded-lg border bg-card mb-6";
const SECTION_HEADER = "px-4 py-3 border-b bg-secondary/40 rounded-t-lg";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_BODY = "p-4 space-y-4";

function str(v: string | null | undefined) {
  return v ?? "";
}

export default function ParametresPage({ initial }: { initial: CompanySettings | null }) {
  const [name, setName] = useState(str(initial?.name));
  const [shareCapital, setShareCapital] = useState(initial?.shareCapital != null ? String(initial.shareCapital) : "");
  const [siren, setSiren] = useState(str(initial?.siren));
  const [siretHQ, setSiretHQ] = useState(str(initial?.siretHeadquarters));
  const [rcsCity, setRcsCity] = useState(str(initial?.rcsCity));
  const [nafCode, setNafCode] = useState(str(initial?.nafCode));
  const [vatIntracom, setVatIntracom] = useState(str(initial?.vatIntracom));
  const [vatExemption, setVatExemption] = useState(initial?.vatExemption ?? false);

  const [addressLine1, setAddressLine1] = useState(str(initial?.addressLine1));
  const [postalCode, setPostalCode] = useState(str(initial?.postalCode));
  const [city, setCity] = useState(str(initial?.city));
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? "FR");

  const [phone, setPhone] = useState(str(initial?.phone));
  const [email, setEmail] = useState(str(initial?.email));

  const [iban, setIban] = useState(str(initial?.iban));
  const [bic, setBic] = useState(str(initial?.bic));

  const [mediatorName, setMediatorName] = useState(str(initial?.mediatorName));
  const [mediatorUrl, setMediatorUrl] = useState(str(initial?.mediatorUrl));
  const [mediatorAddress, setMediatorAddress] = useState(str(initial?.mediatorAddress));

  const [missing, setMissing] = useState<string[]>(initial?.missingMandatoryFields ?? []);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError("");

    const body: Record<string, unknown> = {
      name,
      siren: siren || null,
      siretHeadquarters: siretHQ || null,
      rcsCity: rcsCity || null,
      nafCode: nafCode || null,
      vatIntracom: vatIntracom || null,
      vatExemption,
      addressLine1: addressLine1 || null,
      postalCode: postalCode || null,
      city: city || null,
      countryCode: countryCode || "FR",
      phone: phone || null,
      email: email || null,
      iban: iban || null,
      bic: bic || null,
      mediatorName: mediatorName || null,
      mediatorUrl: mediatorUrl || null,
      mediatorAddress: mediatorAddress || null,
    };
    if (shareCapital) body.shareCapital = parseFloat(shareCapital);

    const res = await fetch("/api/proxy/companySettings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.detail?.message ?? d.message ?? "Erreur lors de l'enregistrement.");
      return;
    }
    const data = (await res.json()) as CompanySettings;
    setMissing(data.missingMandatoryFields ?? []);
    setSuccess(true);
  }

  const isComplete = missing.length === 0;

  return (
    <>
      <PageHeader
        title="Entreprise"
        description="Informations légales de l'émetteur des factures"
      />
      <PageBody>
        <div className="max-w-3xl">
          {/* Completion badge */}
          <div className="mb-6 flex items-center gap-3">
            {isComplete ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Prêt à émettre des factures — toutes les mentions obligatoires sont renseignées.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{missing.length} mention{missing.length > 1 ? "s" : ""} obligatoire{missing.length > 1 ? "s" : ""} manquante{missing.length > 1 ? "s" : ""} :</span>
                {missing.map((f) => (
                  <Badge key={f} variant="outline" className="border-amber-400 text-amber-800 bg-amber-100 text-xs">
                    {MANDATORY_LABELS[f] ?? f}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-0">
            {/* Identité */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Identité de la société</h3></header>
              <div className={SECTION_BODY}>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-name">Raison sociale *</Label>
                  <Input id="ps-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex. : Mon Garage SAS" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-siren">SIREN *</Label>
                    <Input id="ps-siren" value={siren} onChange={(e) => setSiren(e.target.value)} placeholder="9 chiffres" className="font-mono" maxLength={9} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-siret">SIRET siège *</Label>
                    <Input id="ps-siret" value={siretHQ} onChange={(e) => setSiretHQ(e.target.value)} placeholder="14 chiffres" className="font-mono" maxLength={14} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-rcs">Ville RCS *</Label>
                    <Input id="ps-rcs" value={rcsCity} onChange={(e) => setRcsCity(e.target.value)} placeholder="Ex. : Lille" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-naf">Code NAF / APE</Label>
                    <Input id="ps-naf" value={nafCode} onChange={(e) => setNafCode(e.target.value)} placeholder="Ex. : 4520A" className="font-mono" maxLength={10} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-capital">Capital social (€)</Label>
                    <Input id="ps-capital" type="number" min="0" step="0.01" value={shareCapital} onChange={(e) => setShareCapital(e.target.value)} placeholder="Ex. : 10000" />
                  </div>
                </div>
              </div>
            </section>

            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Logo</h3></header>
              <div className={SECTION_BODY}>
                {/* Les boutons sont en type="button" : ils n'entraînent pas la
                    soumission du formulaire qui les entoure. */}
                <CompanyLogoSection initialHasLogo={initial?.hasLogo ?? false} />
              </div>
            </section>

            {/* TVA */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>TVA</h3></header>
              <div className={SECTION_BODY}>
                <div className="flex items-center gap-2">
                  <input
                    id="ps-vatexempt"
                    type="checkbox"
                    className="h-4 w-4 accent-primary cursor-pointer"
                    checked={vatExemption}
                    onChange={(e) => setVatExemption(e.target.checked)}
                  />
                  <Label htmlFor="ps-vatexempt" className="cursor-pointer">
                    Franchise en base de TVA (art. 293 B du CGI)
                  </Label>
                </div>
                {!vatExemption && (
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-vatintra">N° TVA intracommunautaire *</Label>
                    <Input id="ps-vatintra" value={vatIntracom} onChange={(e) => setVatIntracom(e.target.value)} placeholder="Ex. : FR12345678901" className="font-mono" />
                  </div>
                )}
              </div>
            </section>

            {/* Adresse */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Adresse</h3></header>
              <div className={SECTION_BODY}>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-addr">Adresse *</Label>
                  <Input id="ps-addr" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Numéro et rue" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-cp">Code postal *</Label>
                    <Input id="ps-cp" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Ex. : 59000" maxLength={10} />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="ps-city">Ville *</Label>
                    <Input id="ps-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex. : Lille" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-country">Pays (code ISO)</Label>
                  <Input id="ps-country" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} placeholder="FR" maxLength={2} className="w-20 font-mono uppercase" />
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Contact</h3></header>
              <div className={SECTION_BODY}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-phone">Téléphone</Label>
                    <Input id="ps-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ex. : 03 20 …" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-email">E-mail</Label>
                    <Input id="ps-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@garage.fr" />
                  </div>
                </div>
              </div>
            </section>

            {/* Coordonnées bancaires */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Coordonnées bancaires</h3></header>
              <div className={SECTION_BODY}>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label htmlFor="ps-iban">IBAN</Label>
                    <Input id="ps-iban" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="FR76…" className="font-mono text-sm" maxLength={34} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ps-bic">BIC</Label>
                    <Input id="ps-bic" value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} placeholder="Ex. : BNPAFRPP" className="font-mono" maxLength={11} />
                  </div>
                </div>
              </div>
            </section>

            {/* Médiateur */}
            <section className={SECTION}>
              <header className={SECTION_HEADER}><h3 className={SECTION_TITLE}>Médiateur de la consommation *</h3></header>
              <div className={SECTION_BODY}>
                <p className="text-xs text-muted-foreground">Obligatoire sur chaque facture (art. L.616-1 et R.616-1 du Code de la consommation).</p>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-medname">Nom du médiateur *</Label>
                  <Input id="ps-medname" value={mediatorName} onChange={(e) => setMediatorName(e.target.value)} placeholder="Ex. : Médiateur du Commerce et de la Distribution" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-medurl">URL site web *</Label>
                  <Input id="ps-medurl" type="url" value={mediatorUrl} onChange={(e) => setMediatorUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ps-medaddr">Adresse postale</Label>
                  <Textarea
                    id="ps-medaddr"
                    value={mediatorAddress}
                    onChange={(e) => setMediatorAddress(e.target.value)}
                    placeholder="Adresse complète du médiateur (si pas d'URL)"
                    rows={3}
                  />
                </div>
              </div>
            </section>

            {error && (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Paramètres enregistrés.
              </div>
            )}

            <div className="pb-6">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Enregistrer
              </Button>
            </div>
          </form>
        </div>
      </PageBody>
    </>
  );
}
