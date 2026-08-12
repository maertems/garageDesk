"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

type NotificationSettings = {
  notificationOnCreate: boolean;
  notificationReminderDaysBefore: number;
  notificationReminderTime: string;
  notificationMessageOnCreate: string;
  notificationMessageReminder: string;
};

type Endpoint = {
  id: number;
  type: "email" | "sms";
  baseUrl: string;
  sortOrder: number;
  active: boolean;
};

const KEYWORDS_HELP =
  "Mots clés : #NOM#, #PRENOM#, #JOUR#, #MOIS#, #YEAR#, #HEURE#, #MARQUE#, #MODELE#";

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

function toFullHour(t: string): string {
  const h = parseInt(t.slice(0, 2), 10) || 0;
  return `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}:00`;
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [, setSettings] = useState<NotificationSettings | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [onCreate, setOnCreate] = useState(false);
  const [daysBefore, setDaysBefore] = useState(1);
  const [reminderTime, setReminderTime] = useState("19:00");
  const [messageOnCreate, setMessageOnCreate] = useState("");
  const [messageReminder, setMessageReminder] = useState("");

  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [newEndpointType, setNewEndpointType] = useState<"email" | "sms">("email");
  const [newEndpointUrl, setNewEndpointUrl] = useState("");

  useEffect(() => {
    fetch("/api/proxy/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (!user || user.role !== "admin") router.replace("/");
      });
    Promise.all([
      fetch("/api/proxy/notifications/settings", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch("/api/proxy/notifications/endpoints", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : []
      ),
    ])
      .then(([s, e]) => {
        if (s) {
          setSettings(s);
          setOnCreate(s.notificationOnCreate ?? false);
          setDaysBefore(s.notificationReminderDaysBefore ?? 1);
          setReminderTime(toFullHour(s.notificationReminderTime ?? "19:00"));
          setMessageOnCreate(s.notificationMessageOnCreate ?? "");
          setMessageReminder(s.notificationMessageReminder ?? "");
        }
        setEndpoints(Array.isArray(e) ? e : []);
      })
      .catch(() => setError("Chargement impossible"))
      .finally(() => setLoading(false));
  }, [router]);

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/proxy/notifications/settings", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationOnCreate: onCreate,
        notificationReminderDaysBefore: daysBefore,
        notificationReminderTime: reminderTime,
        notificationMessageOnCreate: messageOnCreate,
        notificationMessageReminder: messageReminder,
      }),
    });
    setSaving(false);
    if (!res.ok) setError("Enregistrement des paramètres impossible");
    else router.refresh();
  }

  async function handleAddEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!newEndpointUrl.trim()) return;
    const res = await fetch("/api/proxy/notifications/endpoints", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: newEndpointType,
        baseUrl: newEndpointUrl.trim(),
        sortOrder: endpoints.length,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setEndpoints((prev) => [...prev, created]);
      setNewEndpointUrl("");
    }
  }

  async function handleUpdateEndpoint(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEndpoint || !editUrl.trim()) return;
    const res = await fetch(`/api/proxy/notifications/endpoints/${editingEndpoint.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: editUrl.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEndpoints((prev) =>
        prev.map((ep) => (ep.id === editingEndpoint.id ? updated : ep))
      );
      setEditingEndpoint(null);
      setEditUrl("");
    }
  }

  async function handleToggleActive(ep: Endpoint) {
    const res = await fetch(`/api/proxy/notifications/endpoints/${ep.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ep.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEndpoints((prev) =>
        prev.map((e) => (e.id === ep.id ? { ...e, active: updated.active } : e))
      );
    }
  }

  async function handleDeleteEndpoint(id: number) {
    if (!confirm("Supprimer cet envoi ?")) return;
    const res = await fetch(`/api/proxy/notifications/endpoints/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Notifications" back={{ href: "/admin", label: "Admin" }} />
        <PageBody>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Chargement…
          </div>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Email, SMS, rappels et templates"
        back={{ href: "/admin", label: "Admin" }}
      />
      <PageBody className="space-y-6">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive max-w-3xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="max-w-3xl space-y-5">
          <section className={SECTION_CARD}>
            <header className={SECTION_HEADER}>
              <h3 className={SECTION_TITLE}>Règles d&apos;envoi</h3>
            </header>
            <div className="p-4 space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onCreate}
                  onChange={(e) => setOnCreate(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">
                  Envoyer une notification lors de la création d&apos;un rendez-vous client
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="daysBefore">Rappel : nombre de jours avant le RDV</Label>
                  <Input
                    id="daysBefore"
                    type="number"
                    min={1}
                    max={30}
                    value={daysBefore}
                    onChange={(e) => setDaysBefore(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reminderTime">Heure d&apos;envoi du rappel</Label>
                  <select
                    id="reminderTime"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className={SECTION_CARD}>
            <header className={SECTION_HEADER}>
              <h3 className={SECTION_TITLE}>Templates de message</h3>
            </header>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="msgOnCreate">Message « création de RDV »</Label>
                <Textarea
                  id="msgOnCreate"
                  rows={3}
                  value={messageOnCreate}
                  onChange={(e) => setMessageOnCreate(e.target.value)}
                  placeholder="Bonjour #PRENOM# #NOM#, votre rendez-vous est prévu le #JOUR#/#MOIS#/#YEAR# à #HEURE#..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msgReminder">Message « rappel »</Label>
                <Textarea
                  id="msgReminder"
                  rows={3}
                  value={messageReminder}
                  onChange={(e) => setMessageReminder(e.target.value)}
                  placeholder="Rappel : rendez-vous le #JOUR#/#MOIS#/#YEAR# à #HEURE#..."
                />
              </div>
              <p className="text-xs text-muted-foreground">{KEYWORDS_HELP}</p>
            </div>
          </section>

          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer les paramètres
          </Button>
        </form>

        <section className={`max-w-3xl ${SECTION_CARD}`}>
          <header className={SECTION_HEADER}>
            <h3 className={SECTION_TITLE}>Canaux d&apos;envoi</h3>
          </header>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Chaque canal appelle <code className="font-mono bg-secondary px-1 rounded">POST &lt;URL&gt;/send</code> avec{" "}
              <code className="font-mono bg-secondary px-1 rounded">{`{ destinataire, message }`}</code>.
            </p>
            <div className="space-y-2">
              {endpoints.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">Aucun canal configuré.</p>
              )}
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
                >
                  {editingEndpoint?.id === ep.id ? (
                    <form onSubmit={handleUpdateEndpoint} className="flex items-center gap-2 flex-1">
                      <Input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1"
                      />
                      <Button type="submit" size="sm">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingEndpoint(null);
                          setEditUrl("");
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={ep.active}
                        onChange={() => handleToggleActive(ep)}
                        title={ep.active ? "Désactiver" : "Activer"}
                        className="h-4 w-4 accent-primary"
                      />
                      <Badge variant={ep.type === "email" ? "default" : "secondary"}>
                        {ep.type}
                      </Badge>
                      <span className="text-sm flex-1 truncate font-mono">{ep.baseUrl}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingEndpoint(ep);
                          setEditUrl(ep.baseUrl);
                        }}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteEndpoint(ep.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleAddEndpoint} className="flex gap-2 pt-2 border-t">
              <select
                value={newEndpointType}
                onChange={(e) => setNewEndpointType(e.target.value as "email" | "sms")}
                className="flex h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
              <Input
                type="url"
                value={newEndpointUrl}
                onChange={(e) => setNewEndpointUrl(e.target.value)}
                placeholder="URL de base (ex. http://localhost:123/api)"
                className="flex-1"
              />
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </form>
          </div>
        </section>
      </PageBody>
    </>
  );
}
