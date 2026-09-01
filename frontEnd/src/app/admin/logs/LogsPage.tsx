"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type LogEntry = {
  id: number | null;
  createdAt: string | null;
  eventType: string | null;
  entityId: number | null;
  userId: number | null;
  payload: Record<string, unknown> | null;
};

type ActionEntry = {
  ts: string | null;
  ip: string | null;
  userId: number | null;
  user: string | null;
  action: string | null;
  params: Record<string, unknown> | null;
};

type Onglet = "notifications" | "sync" | "actions";

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "notifications", libelle: "Notifications" },
  { cle: "sync", libelle: "Synchronisation" },
  { cle: "actions", libelle: "Actions" },
];

/** Les échecs portent tous un type se terminant par « Failed ». */
function estEchec(eventType: string | null) {
  return !!eventType && eventType.endsWith("Failed");
}

function horodate(v: string | null) {
  if (!v) return "—";
  // L'API rend un horodatage sans fuseau ; on l'affiche tel quel plutôt que de le
  // décaler d'une conversion hasardeuse.
  return v.replace("T", " ").replace("Z", "");
}

function Cellule({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-t px-3 py-2 align-top ${className}`}>{children}</td>;
}

export default function LogsPage() {
  const [onglet, setOnglet] = useState<Onglet>("notifications");
  const [seulementEchecs, setSeulementEchecs] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [fichierAbsent, setFichierAbsent] = useState(false);
  const [chemin, setChemin] = useState("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      if (onglet === "actions") {
        const r = await fetch("/api/proxy/logs/actions?limit=200");
        if (!r.ok) throw new Error();
        const d = await r.json();
        setActions(d.entries ?? []);
        setFichierAbsent(!!d.fileMissing);
        setChemin(d.path ?? "");
      } else {
        const params = seulementEchecs ? "&onlyFailures=true" : "";
        const r = await fetch(`/api/proxy/logs/${onglet}?limit=200${params}`);
        if (!r.ok) throw new Error();
        setEntries(await r.json());
      }
    } catch {
      setErreur("Lecture du journal impossible.");
    }
    setChargement(false);
  }, [onglet, seulementEchecs]);

  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              onglet === o.cle
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.libelle}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 pb-2">
          {onglet !== "actions" && (
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={seulementEchecs}
                onChange={(e) => setSeulementEchecs(e.target.checked)}
              />
              Échecs seulement
            </label>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void charger()}>
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </Button>
        </div>
      </div>

      {erreur && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {erreur}
        </div>
      )}

      {onglet === "notifications" && (
        <p className="text-xs text-muted-foreground">
          Une ligne par canal et par tentative. Un client sans téléphone ni courriel y
          apparaît en échec avec le motif : c&apos;est la cause la plus fréquente
          d&apos;une notification qui ne part pas.
        </p>
      )}
      {onglet === "sync" && (
        <p className="text-xs text-muted-foreground">
          Rapprochements et créations décidés à l&apos;arrivée des données du script
          extérieur. Le score dit à quel point la fiche ressemblait ; sur une création,
          <span className="font-medium"> meilleur score écarté</span> indique si
          l&apos;on est passé près d&apos;un rapprochement.
        </p>
      )}
      {onglet === "actions" && (
        <p className="text-xs text-muted-foreground">
          Mutations de l&apos;API, lues dans un fichier et non en base. Il est monté
          sur l&apos;hôte depuis la version qui a introduit cette page ; sur un
          conteneur plus ancien, l&apos;historique repart à chaque déploiement.
          {chemin && <span className="ml-1 font-mono">{chemin}</span>}
        </p>
      )}

      {chargement ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : onglet === "actions" ? (
        fichierAbsent ? (
          <p className="py-8 text-sm text-muted-foreground">
            Aucun fichier de journal. Soit rien n&apos;a encore été enregistré, soit le
            conteneur a été recréé sans volume monté.
          </p>
        ) : actions.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">Journal vide.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Utilisateur</th>
                  <th className="px-3 py-2 text-left">IP</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <tr key={i}>
                    <Cellule className="whitespace-nowrap font-mono text-xs">{horodate(a.ts)}</Cellule>
                    <Cellule>{a.user ?? "—"}</Cellule>
                    <Cellule className="font-mono text-xs">{a.ip ?? "—"}</Cellule>
                    <Cellule className="font-mono text-xs">{a.action ?? "—"}</Cellule>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : entries.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Aucune entrée{seulementEchecs ? " en échec" : ""}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Événement</th>
                <th className="px-3 py-2 text-left">
                  {onglet === "notifications" ? "Destinataire" : "Fiche"}
                </th>
                <th className="px-3 py-2 text-left">Détail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const p = e.payload ?? {};
                const echec = estEchec(e.eventType);
                return (
                  <tr key={e.id ?? Math.random()} className={echec ? "bg-destructive/5" : ""}>
                    <Cellule className="whitespace-nowrap font-mono text-xs">
                      {horodate(e.createdAt)}
                    </Cellule>
                    <Cellule>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          echec
                            ? "bg-destructive/10 text-destructive"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.eventType}
                      </span>
                      {onglet === "notifications" && p.endpoint ? (
                        <span className="ml-2 text-xs text-muted-foreground">{String(p.endpoint)}</span>
                      ) : null}
                    </Cellule>
                    <Cellule className="font-mono text-xs">
                      {onglet === "notifications"
                        ? (p.recipient ? String(p.recipient) : "—")
                        : [e.entityId ? `#${e.entityId}` : null, p.lastName ? String(p.lastName) : null,
                           p.licensePlate ? String(p.licensePlate) : null]
                            .filter(Boolean)
                            .join(" ") || "—"}
                    </Cellule>
                    <Cellule className="text-xs">
                      {p.error ? (
                        <span className="text-destructive">{String(p.error)}</span>
                      ) : p.score != null ? (
                        <>score {String(p.score)}
                          {p.completed
                            ? ` — complété : ${Object.keys(p.completed as object).join(", ")}`
                            : ""}
                        </>
                      ) : p.bestRejectedScore != null ? (
                        <>meilleur score écarté {String(p.bestRejectedScore)}</>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Cellule>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
