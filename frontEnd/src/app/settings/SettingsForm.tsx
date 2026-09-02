"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

const selectStyles =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function SettingsForm(props: { initial?: Record<string, string> }) {
  const initial = props.initial ?? {};
  const router = useRouter();
  const toFullHour = (t: string) => {
    const h = parseInt(t.slice(0, 2), 10) || 0;
    return `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}:00`;
  };
  const [defaultView, setDefaultView] = useState(initial.calendarDefaultView ?? "week");
  const [weekDays, setWeekDays] = useState(initial.calendarWeekDays ?? "5");
  const [dayStart, setDayStart] = useState(toFullHour(initial.calendarDayStart ?? "08:00"));
  const [dayEnd, setDayEnd] = useState(toFullHour(initial.calendarDayEnd ?? "18:00"));
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(
    initial.calendarDefaultDurationMinutes ?? "15"
  );
  // Découpage de l'heure dans la grille. À ne pas confondre avec la durée par défaut
  // d'un rendez-vous ci-dessus : celle-ci dit combien de temps dure un RDV créé,
  // celui-là combien de lignes une heure compte à l'écran.
  const [slotMinutes, setSlotMinutes] = useState(initial.calendarSlotMinutes ?? "15");
  const [saving, setSaving] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
  const slotOptions = [
    { value: "15", label: "15 min — 4 blocs par heure" },
    { value: "30", label: "30 min — 2 blocs par heure" },
    { value: "60", label: "1 h — 1 seul bloc" },
  ];
  const durationOptions = [
    { value: "15", label: "15 min" },
    { value: "30", label: "30 min" },
    { value: "60", label: "1 h" },
    { value: "120", label: "2 h" },
    { value: "240", label: "4 h" },
    { value: "480", label: "8 h" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await Promise.all([
      fetch("/api/proxy/settings/calendarDefaultView", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: defaultView }),
      }),
      fetch("/api/proxy/settings/calendarWeekDays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: weekDays }),
      }),
      fetch("/api/proxy/settings/calendarDayStart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: dayStart }),
      }),
      fetch("/api/proxy/settings/calendarDayEnd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: dayEnd }),
      }),
      fetch("/api/proxy/settings/calendarDefaultDurationMinutes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: defaultDurationMinutes }),
      }),
      fetch("/api/proxy/settings/calendarSlotMinutes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: slotMinutes }),
      }),
    ]);
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Affichage du calendrier</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="defaultView">Vue par défaut</Label>
              <select
                id="defaultView"
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value)}
                className={selectStyles}
              >
                <option value="day">Jour</option>
                <option value="week">Semaine</option>
                <option value="month">Mois</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weekDays">Jours visibles (vue semaine)</Label>
              <select
                id="weekDays"
                value={weekDays}
                onChange={(e) => setWeekDays(e.target.value)}
                className={selectStyles}
              >
                <option value="5">5 (lun-ven)</option>
                <option value="6">6 (lun-sam)</option>
                <option value="7">7 (lun-dim)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dayStart">Heure de début</Label>
              <select
                id="dayStart"
                value={dayStart}
                onChange={(e) => setDayStart(e.target.value)}
                className={selectStyles}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dayEnd">Heure de fin</Label>
              <select
                id="dayEnd"
                value={dayEnd}
                onChange={(e) => setDayEnd(e.target.value)}
                className={selectStyles}
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
          <h3 className={SECTION_TITLE}>Découpage de l&apos;heure</h3>
        </header>
        <div className="p-4">
          <div className="space-y-1.5">
            <Label htmlFor="slotMinutes">Hauteur d&apos;un bloc</Label>
            <select
              id="slotMinutes"
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(e.target.value)}
              className={selectStyles}
            >
              {slotOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Découpage de la grille du calendrier. L&apos;heure garde la même hauteur
              à l&apos;écran : elle est simplement coupée en 4, en 2, ou pas du tout.
              Un clic dans la grille crée un rendez-vous au début du bloc, et le
              déplacement d&apos;un rendez-vous s&apos;aligne sur ce même pas.
            </p>
          </div>
        </div>
      </section>

      <section className={SECTION_CARD}>
        <header className={SECTION_HEADER}>
          <h3 className={SECTION_TITLE}>Rendez-vous</h3>
        </header>
        <div className="p-4">
          <div className="space-y-1.5">
            <Label htmlFor="duration">Durée par défaut (nouveau RDV)</Label>
            <select
              id="duration"
              value={defaultDurationMinutes}
              onChange={(e) => setDefaultDurationMinutes(e.target.value)}
              className={selectStyles}
            >
              {durationOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Enregistrer
      </Button>
    </form>
  );
}
