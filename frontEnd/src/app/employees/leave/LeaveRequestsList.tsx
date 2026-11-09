"use client";

import { useState } from "react";
import { Ban, CalendarOff, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { getLabel, leaveRequestStatusLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";

type LeaveRequest = {
  id: number;
  employeeId: number;
  startDate: string;
  endDate: string;
  status: string;
  employeeFirstName?: string;
  employeeLastName?: string;
};
type Employee = { id: number; firstName: string; lastName: string };

/** Message d'erreur renvoyé par l'API (`{ code, message }` dans `detail`). */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail?.message ?? data.message ?? fallback;
  } catch {
    return fallback;
  }
}

export default function LeaveRequestsList({
  initialRequests = [],
  initialEmployees = [],
  canManage = false,
}: {
  initialRequests?: LeaveRequest[];
  initialEmployees?: Employee[];
  canManage?: boolean;
}) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
  const [employees] = useState<Employee[]>(initialEmployees);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [newEmpId, setNewEmpId] = useState(0);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le serveur joint le salarié à chaque demande : c'est la seule source qui
  // porte son nom. Une réponse de POST ou de PATCH ne le contient pas, d'où le
  // rechargement de la liste après chaque écriture — sinon la ligne ajoutée
  // s'affichait sans nom (et non triée).
  async function reload() {
    const res = await fetch("/api/proxy/leaveRequests", { cache: "no-store" });
    if (!res.ok) {
      setError(await errorMessage(res, "Impossible de recharger les demandes."));
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) setRequests(data);
  }

  const filtered = requests.filter((r) => {
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    return (
      (start.getMonth() + 1 === month && start.getFullYear() === year) ||
      (end.getMonth() + 1 === month && end.getFullYear() === year)
    );
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/proxy/leaveRequests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: newEmpId, startDate: newStart, endDate: newEnd }),
    });
    if (!res.ok) {
      setError(await errorMessage(res, "Impossible d'enregistrer la demande."));
      setBusy(false);
      return;
    }
    // Se placer sur le mois de la demande créée, sinon la ligne peut rester
    // invisible (le filtre est appliqué côté navigateur).
    const start = new Date(newStart);
    if (!Number.isNaN(start.getTime())) {
      setMonth(start.getMonth() + 1);
      setYear(start.getFullYear());
    }
    await reload();
    setBusy(false);
    setShowForm(false);
    setNewEmpId(0);
    setNewStart("");
    setNewEnd("");
  }

  function openEdit(r: LeaveRequest) {
    setError(null);
    setEditing(r);
    setEditStart(r.startDate.slice(0, 10));
    setEditEnd(r.endDate.slice(0, 10));
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/proxy/leaveRequests/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: editStart, endDate: editEnd }),
    });
    if (!res.ok) {
      setError(await errorMessage(res, "Impossible de modifier la demande."));
      setBusy(false);
      return;
    }
    await reload();
    setBusy(false);
    setEditing(null);
  }

  async function changeStatus(r: LeaveRequest, status: string) {
    setBusyId(r.id);
    setError(null);
    const res = await fetch(`/api/proxy/leaveRequests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setError(await errorMessage(res, "Impossible de changer le statut."));
      setBusyId(null);
      return;
    }
    await reload();
    setBusyId(null);
  }

  async function handleDelete(r: LeaveRequest) {
    if (!confirm("Supprimer cette demande de congé ?")) return;
    setBusyId(r.id);
    setError(null);
    const res = await fetch(`/api/proxy/leaveRequests/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await errorMessage(res, "Impossible de supprimer la demande."));
      setBusyId(null);
      return;
    }
    setRequests((prev) => prev.filter((x) => x.id !== r.id));
    setBusyId(null);
  }

  // Le garage reconnaît les salariés à leur prénom : c'est déjà le libellé du
  // calendrier. Le nom complet reste en infobulle et dans le choix du salarié.
  const employeeName = (r: LeaveRequest) =>
    r.employeeFirstName?.trim() || `Salarié #${r.employeeId}`;

  const employeeFullName = (r: LeaveRequest) =>
    [r.employeeLastName, r.employeeFirstName].filter(Boolean).join(" ");

  /** Date du jour au format `YYYY-MM-DD`, en heure locale (pas UTC). */
  function todayIso(): string {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function openCreate() {
    setError(null);
    // Pré-remplies à aujourd'hui : la plupart des demandes sont saisies le jour
    // même, et le champ restait vide à chaque ouverture.
    setNewStart(todayIso());
    setNewEnd(todayIso());
    setShowForm(true);
  }

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        title="Congés"
        description="Demandes de congés des salariés"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle demande
          </Button>
        }
      />
      <PageBody className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="month">Mois</Label>
            <Input
              id="month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-20"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year">Année</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-28"
            />
          </div>
          <span className="text-sm text-muted-foreground pb-2 ml-2 first-letter:capitalize">
            {monthLabel}
          </span>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<CalendarOff className="h-5 w-5" />}
            title="Aucun congé"
            description="Aucune demande pour cette période."
          />
        ) : (
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salarié</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, idx) => {
                  const rowBusy = busyId === r.id;
                  // Un salarié peut corriger les dates d'une demande encore en
                  // attente ; un administrateur peut aussi modifier une demande
                  // déjà traitée.
                  const canEdit = canManage || r.status === "pending";
                  return (
                    <TableRow key={r.id} className={idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}>
                      <TableCell className="font-medium" title={employeeFullName(r) || undefined}>
                        {employeeName(r)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {new Date(r.startDate).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {new Date(r.endDate).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "approved"
                              ? "success"
                              : r.status === "cancelled"
                                ? "destructive"
                                : "warning"
                          }
                        >
                          {getLabel(leaveRequestStatusLabels, r.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(r)}
                            disabled={rowBusy}
                            aria-label="Modifier"
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && r.status === "pending" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => changeStatus(r, "approved")}
                            disabled={rowBusy}
                            className="text-muted-foreground hover:text-emerald-600"
                            aria-label="Valider"
                            title="Valider"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && r.status !== "cancelled" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => changeStatus(r, "cancelled")}
                            disabled={rowBusy}
                            className="text-muted-foreground hover:text-amber-600"
                            aria-label="Annuler la demande"
                            title="Annuler la demande"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(r)}
                            disabled={rowBusy}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      {showForm && (
        <Dialog open onOpenChange={(o) => !o && !busy && setShowForm(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nouvelle demande de congé</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp">Salarié</Label>
                <select
                  id="emp"
                  value={newEmpId}
                  onChange={(e) => setNewEmpId(Number(e.target.value))}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={0}>— Choisir —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.lastName} {emp.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="leaveStart">Début</Label>
                  <Input
                    id="leaveStart"
                    type="date"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="leaveEnd">Fin</Label>
                  <Input
                    id="leaveEnd"
                    type="date"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={busy}>
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={busy}>
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && !busy && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier la demande</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEdit} className="px-6 py-4 space-y-4">
              <p className="text-sm text-muted-foreground">{employeeFullName(editing)}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="editStart">Début</Label>
                  <Input
                    id="editStart"
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="editEnd">Fin</Label>
                  <Input
                    id="editEnd"
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                    required
                  />
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                Annuler
              </Button>
              <Button onClick={handleEdit} disabled={busy}>
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
