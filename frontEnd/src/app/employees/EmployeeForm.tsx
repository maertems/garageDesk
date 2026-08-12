"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getLabel, employeeCategoryLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

export default function EmployeeForm({ initial }: { initial?: Record<string, unknown> | null }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState((initial?.firstName as string) ?? "");
  const [lastName, setLastName] = useState((initial?.lastName as string) ?? "");
  const [category, setCategory] = useState((initial?.category as string) ?? "mechanic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = initial?.id as number | undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const url = id ? `/api/proxy/employees/${id}` : "/api/proxy/employees";
    const res = await fetch(url, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, category }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message || "Erreur");
      return;
    }
    router.push("/employees");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Identité</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">Prénom *</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Nom *</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Catégorie</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="mechanic">{getLabel(employeeCategoryLabels, "mechanic")}</option>
              <option value="bodywork">{getLabel(employeeCategoryLabels, "bodywork")}</option>
              <option value="office">{getLabel(employeeCategoryLabels, "office")}</option>
              <option value="director">{getLabel(employeeCategoryLabels, "director")}</option>
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {id ? "Enregistrer" : "Créer"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/employees">Annuler</Link>
        </Button>
      </div>
    </form>
  );
}
