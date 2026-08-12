"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { getLabel, employeeCategoryLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type Employee = { id: number; firstName: string; lastName: string; category: string };

export default function EmployeesList({ initialEmployees = [] }: { initialEmployees?: Employee[] }) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);

  useEffect(() => {
    if (initialEmployees.length > 0) return;
    fetch("/api/proxy/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [initialEmployees.length]);

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce salarié ?")) return;
    const res = await fetch(`/api/proxy/employees/${id}`, { method: "DELETE" });
    if (res.ok) setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <>
      <PageHeader
        title="Salariés"
        description={`${employees.length} salarié${employees.length > 1 ? "s" : ""}`}
        actions={
          <Button asChild>
            <Link href="/employees/new">
              <Plus className="h-4 w-4" />
              Nouveau salarié
            </Link>
          </Button>
        }
      />
      <PageBody>
        {employees.length === 0 ? (
          <EmptyState
            icon={<UsersRound className="h-5 w-5" />}
            title="Aucun salarié"
            description="Ajoutez le premier membre de l'équipe."
            action={
              <Button asChild>
                <Link href="/employees/new">
                  <Plus className="h-4 w-4" />
                  Nouveau salarié
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e, idx) => (
                  <TableRow key={e.id} className={idx % 2 === 1 ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-accent/40"}>
                    <TableCell>
                      <Link
                        href={`/employees/${e.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {e.lastName} {e.firstName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getLabel(employeeCategoryLabels, e.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(e.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </>
  );
}
