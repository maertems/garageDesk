"use client";

/**
 * Pied de liste paginée : taille de page, « 1–20 sur 5 125 », première /
 * précédente / suivante / dernière.
 *
 * Écrit une première fois dans la liste des documents, il sert maintenant aux
 * trois listes paginées côté serveur. `total` est le nombre de lignes qui
 * répondent au filtre, pas celui de la page.
 */

export const PAGE_SIZE_OPTIONS = [20, 50, 100];

/** Réponse paginée de l'API : `{ items, total }`, `total` = lignes répondant au filtre. */
export type Page<T> = { items: T[]; total: number };

type PagerProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
};

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PagerProps) {
  const totalPages = pageCount(total, pageSize);
  const bouton = "px-2 py-1 rounded border disabled:opacity-40 hover:bg-accent";
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Lignes par page :</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="border rounded px-2 py-1 text-sm bg-background"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-2">
          {total === 0
            ? "0 résultat"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} sur ${total}`}
        </span>
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={bouton} aria-label="Première page">
          «
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className={bouton}
          aria-label="Page précédente"
        >
          ‹
        </button>
        <span className="px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className={bouton}
          aria-label="Page suivante"
        >
          ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className={bouton}
          aria-label="Dernière page"
        >
          »
        </button>
      </div>
    </div>
  );
}
