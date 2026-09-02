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

/** Catégories et statuts ont la même forme et la même route de mise à jour. */
export type ColoredCode = { id: number; code: string; color?: string | null };
export type AppointmentCategory = ColoredCode;
export type AppointmentStatus = ColoredCode;

/**
 * Les couleurs stockées ne sont pas garanties hexadécimales : la colonne est un
 * `VARCHAR(32)` sans validation, et la valeur part telle quelle dans le style du
 * bloc de rendez-vous. Or `<input type="color">` n'accepte qu'un `#rrggbb` et
 * ramène silencieusement tout le reste à `#000000` — ouvrir cette page suffirait
 * donc à proposer du noir pour une catégorie enregistrée en `red`. D'où deux
 * précautions : cette normalisation ne sert qu'à l'AFFICHAGE du sélecteur, et
 * seules les lignes réellement touchées sont enregistrées.
 */
function normaliserHex(valeur: string | null | undefined, defaut: string): string {
  const v = (valeur ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  // Forme courte : #abc vaut #aabbcc.
  const court = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (court) return `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`.toLowerCase();
  return defaut;
}

// Replis EXACTEMENT ceux du calendrier (`CalendarView.tsx`) : sans cela, le
// sélecteur montrerait pour une couleur absente autre chose que ce qui est
// réellement dessiné à l'écran.
const DEFAUT_CATEGORIE = "#e0e0e0";
const DEFAUT_STATUT = "#999999";

/** Vrai si la valeur stockée n'est pas une couleur que le sélecteur sait montrer. */
function hexIllisible(valeur: string | null | undefined): boolean {
  const v = (valeur ?? "").trim();
  if (!v) return false;
  return !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

/**
 * Une section de couleurs, pour les catégories comme pour les statuts.
 *
 * `apercu` dit comment la couleur est employée dans le calendrier, et l'aperçu le
 * reproduit : la catégorie peint le **fond** du bloc, le statut sa **bordure
 * gauche de 6 px**. Montrer les deux pareil laisserait juger une lisibilité qui
 * n'est pas celle de l'écran réel.
 */
function SectionCouleurs({
  titre,
  note,
  prefixe,
  items,
  couleurs,
  onChange,
  apercu,
  defaut,
  vide,
}: {
  titre: string;
  note: string;
  prefixe: string;
  items: ColoredCode[];
  couleurs: Record<number, string>;
  onChange: (id: number, valeur: string) => void;
  apercu: "fond" | "bordure";
  defaut: string;
  vide: string;
}) {
  return (
    <section className={SECTION_CARD}>
      <header className={SECTION_HEADER}>
        <h3 className={SECTION_TITLE}>{titre}</h3>
      </header>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{vide}</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{note}</p>
            <div className="space-y-3">
              {items.map((it) => {
                const couleur = couleurs[it.id] ?? defaut;
                return (
                  <div key={it.id} className="flex items-center gap-3">
                    <input
                      type="color"
                      id={`${prefixe}-${it.id}`}
                      value={couleur}
                      onChange={(e) => onChange(it.id, e.target.value)}
                      className="h-9 w-14 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
                    />
                    <Label
                      htmlFor={`${prefixe}-${it.id}`}
                      className="flex-1 cursor-pointer first-letter:capitalize"
                    >
                      {it.code}
                    </Label>
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-medium first-letter:capitalize"
                      style={
                        apercu === "fond"
                          ? { background: couleur }
                          : {
                              background: DEFAUT_CATEGORIE,
                              borderLeft: `6px solid ${couleur}`,
                            }
                      }
                    >
                      {it.code}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {couleur}
                    </span>
                  </div>
                );
              })}
            </div>
            {items.some((it) => hexIllisible(it.color)) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {items
                  .filter((it) => hexIllisible(it.color))
                  .map((it) => `${it.code} : « ${it.color} »`)
                  .join(", ")}{" "}
                — cette valeur n&apos;est pas hexadécimale et le sélecteur ne peut pas la
                montrer. Elle reste en base tant que vous n&apos;y touchez pas ; la
                changer l&apos;écrasera.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function SettingsForm(props: {
  initial?: Record<string, string>;
  initialCategories?: AppointmentCategory[];
  initialStatuses?: AppointmentStatus[];
}) {
  const initial = props.initial ?? {};
  const categories = props.initialCategories ?? [];
  const statuts = props.initialStatuses ?? [];
  const router = useRouter();
  // Couleurs en cours d'édition, par identifiant.
  const [couleurs, setCouleurs] = useState<Record<number, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, normaliserHex(c.color, DEFAUT_CATEGORIE)]))
  );
  const [couleursStatuts, setCouleursStatuts] = useState<Record<number, string>>(() =>
    Object.fromEntries(statuts.map((s) => [s.id, normaliserHex(s.color, DEFAUT_STATUT)]))
  );
  // Lignes que l'utilisateur a effectivement changées : ce sont les SEULES qui
  // partiront en PATCH, pour la raison expliquée au-dessus.
  const [touchees, setTouchees] = useState<number[]>([]);
  const [toucheesStatuts, setToucheesStatuts] = useState<number[]>([]);
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
  const [hourHeightPx, setHourHeightPx] = useState(initial.calendarHourHeightPx ?? "88");
  const [saving, setSaving] = useState(false);
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
  // Nommées plutôt que chiffrées : « compact » se choisit mieux que « 68 px ». La
  // valeur enregistrée reste le nombre de pixels, la correspondance est rappelée sous
  // le champ pour qui a besoin du chiffre.
  //
  // Les quatre sont des multiples de 4, condition de l'alignement entre la colonne
  // des heures et les lignes de la grille, qui sont deux colonnes distinctes.
  const hourHeightOptions = [
    { value: "56", label: "Petit" },
    { value: "68", label: "Compact" },
    { value: "88", label: "Normal" },
    { value: "112", label: "Large" },
  ];
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
      fetch("/api/proxy/settings/calendarHourHeightPx", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: hourHeightPx }),
      }),
      // Les couleurs ne sont pas des réglages clé/valeur : chaque catégorie et
      // chaque statut est une ressource à part, d'où un PATCH par ligne touchée.
      ...touchees.map((id) =>
        fetch(`/api/proxy/appointmentCategories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: couleurs[id] }),
        })
      ),
      ...toucheesStatuts.map((id) =>
        fetch(`/api/proxy/appointmentStatuses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ color: couleursStatuts[id] }),
        })
      ),
    ]);
    setTouchees([]);
    setToucheesStatuts([]);
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
              Découpage de la grille du calendrier. L&apos;heure garde la hauteur
              choisie ci-dessous : elle est simplement coupée en 4, en 2, ou pas du
              tout. Un clic dans la grille crée un rendez-vous au début du bloc, et le
              déplacement d&apos;un rendez-vous s&apos;aligne sur ce même pas.
            </p>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label htmlFor="hourHeightPx">Hauteur d&apos;une heure</Label>
            <select
              id="hourHeightPx"
              value={hourHeightPx}
              onChange={(e) => setHourHeightPx(e.target.value)}
              className={selectStyles}
            >
              {hourHeightOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Décide de la hauteur de la journée entière : une journée de dix heures
              occupe dix fois cette valeur. Petit 56 px, compact 68, normal 88, large
              112 — soit de 560 à 1 120 px pour dix heures.
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

      <SectionCouleurs
        titre="Couleurs des catégories"
        note="C'est le fond du bloc de rendez-vous dans le calendrier. L'aperçu montre le libellé tel qu'il s'affichera par-dessus."
        prefixe="categorie"
        items={categories}
        couleurs={couleurs}
        apercu="fond"
        defaut={DEFAUT_CATEGORIE}
        vide="Aucune catégorie de rendez-vous n'a pu être lue."
        onChange={(id, valeur) => {
          setCouleurs((p) => ({ ...p, [id]: valeur }));
          setTouchees((p) => (p.includes(id) ? p : [...p, id]));
        }}
      />

      <SectionCouleurs
        titre="Couleurs des statuts"
        note="C'est la bordure gauche du bloc de rendez-vous, sur 6 px, par-dessus la couleur de la catégorie."
        prefixe="statut"
        items={statuts}
        couleurs={couleursStatuts}
        apercu="bordure"
        defaut={DEFAUT_STATUT}
        vide="Aucun statut de rendez-vous n'a pu être lu."
        onChange={(id, valeur) => {
          setCouleursStatuts((p) => ({ ...p, [id]: valeur }));
          setToucheesStatuts((p) => (p.includes(id) ? p : [...p, id]));
        }}
      />

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Enregistrer
      </Button>
    </form>
  );
}
