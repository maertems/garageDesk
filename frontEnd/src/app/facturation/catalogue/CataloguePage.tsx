"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { unitCodeLabels, vatCategoryLabels, getLabel } from "@/lib/labels";
import ArticleFormModal from "./ArticleFormModal";
import VatRateFormModal from "./VatRateFormModal";
import LaborGridTab, { LABOR_GRID_REFERENCES } from "./LaborGridTab";

export type VatRate = {
  id: number;
  code: string;
  rate: number;
  label: string;
  facturXCategory: string;
  validFrom: string | null;
  validUntil: string | null;
};

export type Article = {
  id: number;
  reference: string | null;
  type: string | null;
  label: string;
  unitCode: string;
  vatRateId: number | null;
  price: number;
  isActive: boolean;
};

const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const TABS = ["articles", "labor", "vatRates"] as const;
type Tab = (typeof TABS)[number];

export default function CataloguePage({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>("articles");
  const [articles, setArticles] = useState<Article[]>([]);
  const [vatRates, setVatRates] = useState<VatRate[]>([]);
  const [search, setSearch] = useState("");

  const [articleModal, setArticleModal] = useState<{ open: boolean; initial?: Article | null }>({
    open: false,
    initial: null,
  });
  const [vatRateModal, setVatRateModal] = useState<{ open: boolean; initial?: VatRate | null }>({
    open: false,
    initial: null,
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetch("/api/proxy/articles")
      .then((r) => r.json())
      .then((d) => setArticles(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/proxy/vatRates")
      .then((r) => r.json())
      .then((d) => setVatRates(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const filteredArticles = useMemo(() => {
    // Les tarifs de main d'œuvre (M1..T3) ont leur propre onglet — on ne les
    // affiche pas dans la liste générique des articles.
    const base = articles.filter((a) => !a.reference || !LABOR_GRID_REFERENCES.includes(a.reference));
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.reference ?? "").toLowerCase().includes(q) ||
        (a.type ?? "").toLowerCase().includes(q)
    );
  }, [articles, search]);

  const filteredVatRates = useMemo(() => {
    if (!search.trim()) return vatRates;
    const q = search.toLowerCase();
    return vatRates.filter(
      (v) =>
        v.code.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q)
    );
  }, [vatRates, search]);

  const vatRateById = useMemo(
    () => Object.fromEntries(vatRates.map((v) => [v.id, v])),
    [vatRates]
  );

  function onArticleSaved(saved: Article) {
    setArticles((prev) => {
      const idx = prev.findIndex((a) => a.id === saved.id);
      return idx >= 0
        ? prev.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...prev];
    });
    setArticleModal({ open: false });
  }

  function onVatRateSaved(saved: VatRate) {
    setVatRates((prev) => {
      const idx = prev.findIndex((v) => v.id === saved.id);
      return idx >= 0
        ? prev.map((v) => (v.id === saved.id ? saved : v))
        : [...prev, saved];
    });
    setVatRateModal({ open: false });
  }

  async function handleDeleteArticle(a: Article) {
    if (!confirm(`Supprimer l'article « ${a.label} » ?`)) return;
    setDeleteError("");
    setDeletingId(a.id);
    const res = await fetch(`/api/proxy/articles/${a.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok && res.status !== 204) {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.detail?.message ?? d.message ?? "Erreur lors de la suppression.");
      return;
    }
    setArticles((prev) => prev.filter((x) => x.id !== a.id));
  }

  async function handleDeleteVatRate(v: VatRate) {
    if (!confirm(`Supprimer le taux « ${v.label} » ?`)) return;
    setDeleteError("");
    setDeletingId(v.id);
    const res = await fetch(`/api/proxy/vatRates/${v.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok && res.status !== 204) {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.detail?.message ?? d.message ?? "Erreur lors de la suppression.");
      return;
    }
    setVatRates((prev) => prev.filter((x) => x.id !== v.id));
  }

  const tabCls = (t: Tab) =>
    cn(
      "px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors",
      tab === t
        ? "border-primary text-primary"
        : "border-transparent text-muted-foreground hover:text-foreground"
    );

  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Articles, main d'œuvre et taux de TVA"
        actions={
          isAdmin ? (
            tab === "articles" ? (
              <Button onClick={() => setArticleModal({ open: true, initial: null })}>
                <Plus className="h-4 w-4" />
                Nouvel article
              </Button>
            ) : tab === "vatRates" ? (
              <Button onClick={() => setVatRateModal({ open: true, initial: null })}>
                <Plus className="h-4 w-4" />
                Nouveau taux
              </Button>
            ) : undefined
          ) : undefined
        }
        search={
          tab !== "labor" ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          ) : undefined
        }
      />
      <PageBody>
        {/* Tabs */}
        <nav className="flex gap-1 border-b mb-4">
          <button className={tabCls("articles")} onClick={() => setTab("articles")}>
            Articles ({filteredArticles.length})
          </button>
          <button className={tabCls("labor")} onClick={() => setTab("labor")}>
            Main d&apos;œuvre
          </button>
          <button className={tabCls("vatRates")} onClick={() => setTab("vatRates")}>
            Taux de TVA ({vatRates.length})
          </button>
        </nav>

        {deleteError && (
          <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {deleteError}
          </p>
        )}

        {tab === "labor" && (
          <LaborGridTab articles={articles} vatRates={vatRates} isAdmin={isAdmin} onSaved={onArticleSaved} />
        )}

        {tab === "articles" && (
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead className="text-right">Prix HT</TableHead>
                  <TableHead>TVA</TableHead>
                  <TableHead>Statut</TableHead>
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                      {search ? "Aucun résultat." : "Aucun article."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((a, idx) => {
                    const vat = a.vatRateId ? vatRateById[a.vatRateId] : null;
                    return (
                      <TableRow
                        key={a.id}
                        className={cn(
                          !a.isActive && "opacity-50",
                          idx % 2 === 1 ? "bg-primary/10" : ""
                        )}
                      >
                        <TableCell className="font-mono text-xs">{a.reference ?? <span className="opacity-40">—</span>}</TableCell>
                        <TableCell className="font-medium">{a.label}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{a.type ?? <span className="opacity-40">—</span>}</TableCell>
                        <TableCell className="text-sm">{getLabel(unitCodeLabels, a.unitCode)}</TableCell>
                        <TableCell className="text-right tabular-nums">{eur(a.price)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {vat ? `${vat.rate} %` : <span className="opacity-40">—</span>}
                        </TableCell>
                        <TableCell>
                          {a.isActive ? (
                            <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">Actif</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Inactif</Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setArticleModal({ open: true, initial: a })}
                                aria-label="Modifier"
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={deletingId === a.id}
                                onClick={() => handleDeleteArticle(a)}
                                aria-label="Supprimer"
                              >
                                <Trash2 className="h-4 w-4 text-destructive/70" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {tab === "vatRates" && (
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Taux</TableHead>
                  <TableHead>Catégorie Factur-X</TableHead>
                  <TableHead>Valide du</TableHead>
                  <TableHead>Au</TableHead>
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVatRates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      {search ? "Aucun résultat." : "Aucun taux de TVA."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVatRates.map((v, idx) => (
                    <TableRow key={v.id} className={idx % 2 === 1 ? "bg-primary/10" : ""}>
                      <TableCell className="font-mono text-xs">{v.code}</TableCell>
                      <TableCell className="font-medium">{v.label}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{v.rate} %</TableCell>
                      <TableCell className="text-sm">
                        <span className="font-mono">{v.facturXCategory}</span>
                        {" "}
                        <span className="text-muted-foreground">{getLabel(vatCategoryLabels, v.facturXCategory)}</span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{v.validFrom ?? <span className="opacity-40">—</span>}</TableCell>
                      <TableCell className="text-sm tabular-nums">{v.validUntil ?? <span className="opacity-40">—</span>}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setVatRateModal({ open: true, initial: v })}
                              aria-label="Modifier"
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingId === v.id}
                              onClick={() => handleDeleteVatRate(v)}
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-4 w-4 text-destructive/70" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>

      <ArticleFormModal
        open={articleModal.open}
        onClose={() => setArticleModal({ open: false })}
        onSaved={onArticleSaved}
        initial={articleModal.initial ?? null}
        vatRates={vatRates}
      />

      <VatRateFormModal
        open={vatRateModal.open}
        onClose={() => setVatRateModal({ open: false })}
        onSaved={onVatRateSaved}
        initial={vatRateModal.initial ?? null}
      />
    </>
  );
}
