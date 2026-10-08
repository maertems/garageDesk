"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import ReferentielEditor, { lignesDepuis, type Entree, type Ligne } from "./ReferentielEditor";

const SECTION_HEADER = "px-4 py-2 border-b bg-secondary/40";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const SECTION_CARD = "rounded-lg border bg-card overflow-hidden";

const selectStyles =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Catégories et états : même forme, même routes. Le type vient de l'éditeur. */
export type AppointmentCategory = Entree;
export type AppointmentStatus = Entree;

// Replis EXACTEMENT ceux du calendrier (`CalendarView.tsx`) : sans cela, le
// sélecteur montrerait pour une couleur absente autre chose que ce qui est
// réellement dessiné à l'écran.
const DEFAUT_CATEGORIE = "#e0e0e0";
const DEFAUT_STATUT = "#999999";

export default function SettingsForm(props: {
  initial?: Record<string, string>;
  initialCategories?: AppointmentCategory[];
  initialStatuses?: AppointmentStatus[];
}) {
  const initial = props.initial ?? {};
  const categories = props.initialCategories ?? [];
  const statuts = props.initialStatuses ?? [];
  const router = useRouter();
  // Référentiels en cours d'édition. L'ordre du tableau EST l'ordre d'affichage :
  // `sortOrder` est recalculé à l'enregistrement, personne n'ayant envie de gérer
  // des dizaines à la main.
  const [lignesCategories, setLignesCategories] = useState(() =>
    lignesDepuis(categories, DEFAUT_CATEGORIE)
  );
  const [lignesStatuts, setLignesStatuts] = useState(() =>
    lignesDepuis(statuts, DEFAUT_STATUT)
  );
  // Référence du départ, pour n'envoyer que ce qui a vraiment changé.
  const [categoriesInitiales] = useState(() => lignesDepuis(categories, DEFAUT_CATEGORIE));
  const [statutsInitiales] = useState(() => lignesDepuis(statuts, DEFAUT_STATUT));
  const [erreurReferentiel, setErreurReferentiel] = useState("");
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
    ]);

    // Les référentiels ne sont pas des réglages clé/valeur : chaque entrée est une
    // ressource, avec sa création, sa modification et sa suppression.
    const erreurs = [
      ...(await appliquerReferentiel("appointmentCategories", lignesCategories, categoriesInitiales)),
      ...(await appliquerReferentiel("appointmentStatuses", lignesStatuts, statutsInitiales)),
    ];
    setErreurReferentiel(erreurs.join(" "));
    setSaving(false);

    // Rechargement SEULEMENT si tout est passé. `router.refresh()` remonte ce
    // composant et remet son état à zéro — mesuré : une ligne marquée supprimée
    // redevient normale en 0,7 s. En cas d'échec, cela effacerait d'un coup le
    // message d'erreur ET les modifications en attente : l'utilisateur verrait son
    // travail disparaître sans savoir pourquoi.
    //
    // Quand tout est passé, le rechargement est au contraire nécessaire : les
    // identifiants des entrées créées ne sont connus que du serveur.
    if (erreurs.length === 0) router.refresh();
  }

  /**
   * Applique un référentiel : modifications, créations, puis suppressions.
   *
   * Cet ordre n'est pas indifférent. Les suppressions viennent en DERNIER parce
   * qu'elles peuvent être refusées — une entrée encore utilisée par des
   * rendez-vous rend un 409 — et qu'un refus ne doit pas empêcher le reste
   * d'être enregistré.
   *
   * Rend la liste des messages d'erreur, vide si tout est passé.
   */
  async function appliquerReferentiel(
    ressource: string,
    lignes: Ligne[],
    initiales: Ligne[]
  ): Promise<string[]> {
    const erreurs: string[] = [];
    const parId = new Map(initiales.map((l) => [l.id, l]));

    const envoyer = async (url: string, method: string, corps?: unknown) => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(corps ? { body: JSON.stringify(corps) } : {}),
      });
      if (res.ok) return true;
      const d = await res.json().catch(() => ({}));
      erreurs.push(d.detail?.message || d.message || "Erreur lors de l'enregistrement.");
      return false;
    };

    // L'ordre d'affichage est celui du tableau ; `sortOrder` est recalculé ici,
    // espacé de dix comme en base, et ne compte que les lignes qui restent.
    let rang = 0;
    for (const l of lignes) {
      if (l.supprimee) continue;
      rang += 10;
      const avant = l.id != null ? parId.get(l.id) : undefined;
      const corps = {
        label: l.label.trim() || null,
        color: l.color,
        sortOrder: rang,
      };
      if (l.id == null) {
        await envoyer(`/api/proxy/${ressource}`, "POST", { ...corps, code: l.code });
      } else if (
        avant &&
        (avant.label !== l.label.trim() ||
          avant.color !== l.color ||
          initiales.indexOf(avant) * 10 + 10 !== rang)
      ) {
        await envoyer(`/api/proxy/${ressource}/${l.id}`, "PATCH", corps);
      }
    }

    for (const l of lignes) {
      if (l.supprimee && l.id != null) {
        await envoyer(`/api/proxy/${ressource}/${l.id}`, "DELETE");
      }
    }
    return erreurs;
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

      <ReferentielEditor
        titre="Catégories de rendez-vous"
        note="La couleur est le fond du bloc dans le calendrier. L'aperçu montre le libellé tel qu'il s'affichera."
        prefixe="categorie"
        lignes={lignesCategories}
        onChange={setLignesCategories}
        apercu="fond"
        couleurDefaut={DEFAUT_CATEGORIE}
        fondApercu={DEFAUT_CATEGORIE}
        enregistrement={saving}
      />

      <ReferentielEditor
        titre="États de rendez-vous"
        note="La couleur borde le bloc à gauche, sur 6 px, par-dessus celle de la catégorie. L'ordre est celui de l'enchaînement du travail."
        prefixe="statut"
        lignes={lignesStatuts}
        onChange={setLignesStatuts}
        apercu="bordure"
        couleurDefaut={DEFAUT_STATUT}
        fondApercu={DEFAUT_CATEGORIE}
        enregistrement={saving}
      />

      {erreurReferentiel && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erreurReferentiel}
        </div>
      )}

      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Enregistrer
      </Button>
    </form>
  );
}
