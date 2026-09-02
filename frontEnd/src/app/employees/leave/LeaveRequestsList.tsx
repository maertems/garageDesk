"use client";

import { useState, useEffect } from "react";
import { CalendarOff, Plus } from "lucide-react";
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

export default function LeaveRequestsList({
  initialRequests = [],
  initialEmployees = [],
}: {
  initialRequests?: LeaveRequest[];
  initialEmployees?: Employee[];
}) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [newEmpId, setNewEmpId] = useState(0);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Les deux appels du montage ont disparu : ils rechargeaient une liste que le
  // serveur venait de rendre, et le formulaire s'ouvrait sur un choix de salariés
  // vide le temps du second.
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
    const res = await fetch("/api/proxy/leaveRequests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: newEmpId, startDate: newStart, endDate: newEnd }),
    });
    if (res.ok) {
      const created = await res.json();
      setRequests((prev) => [...prev, created]);
      setShowForm(false);
      setNewEmpId(0);
      setNewStart("");
      setNewEnd("");
    }
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
          <Button onClick={() => setShowForm(true)}>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, idx) => (
                  <TableRow key={r.id} className={idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}>
                    <TableCell className="font-medium">
                      {r.employeeFirstName} {r.employeeLastName}
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      {showForm && (
        <Dialog open onOpenChange={(o) => !o && setShowForm(false)}>
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
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate}>Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
