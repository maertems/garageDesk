/**
 * Paramètres de la liste des documents, dans un module SANS « use client ».
 *
 * `page.tsx` (serveur) les lit pour rendre la première page, la liste (client)
 * les relit. Ils vivaient dans la liste : tout export d'un module client importé
 * depuis le serveur devient une référence opaque, et la page serveur appelait une
 * fonction qui n'en était plus une. `tsc` et `next build` ne voient rien.
 */

export type SortKey = "docNum" | "dateDoc" | "licensePlate" | "vehicleModel" | "client" | "type" | "status";
export type Filters = Record<"docNum" | "dateDoc" | "licensePlate" | "vehicleModel" | "client" | "type" | "status", string>;

export const EMPTY_FILTERS: Filters = { docNum: "", dateDoc: "", licensePlate: "", vehicleModel: "", client: "", type: "", status: "" };
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Paramètres de la liste tels qu'ils voyagent dans l'URL de la page ET vers
 * l'API : mêmes noms, mêmes valeurs. `page.tsx` les lit pour rendre la première
 * page côté serveur, la liste les relit pour reprendre là où l'on était.
 */
export type DocumentsQuery = {
  filters: Filters;
  sortBy: SortKey;
  sortOrder: "asc" | "desc";
  pageSize: number;
  page: number;
  showAll: boolean;
};

export function lireQuery(get: (k: string) => string | null): DocumentsQuery {
  return {
    filters: {
      docNum: get("docNum") ?? "",
      dateDoc: get("dateDoc") ?? "",
      licensePlate: get("licensePlate") ?? "",
      vehicleModel: get("vehicleModel") ?? "",
      client: get("client") ?? "",
      type: get("type") ?? "",
      status: get("status") ?? "",
    },
    sortBy: (get("sortBy") as SortKey) || "dateDoc",
    sortOrder: (get("sortOrder") as "asc" | "desc") || "desc",
    pageSize: Number(get("pageSize")) || DEFAULT_PAGE_SIZE,
    page: Number(get("page")) || 1,
    showAll: get("showAll") === "1",
  };
}

/** Chaîne de requête de l'API pour une page donnée. */
export function apiQuery(q: DocumentsQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q.filters)) if (v) p.set(k, v);
  p.set("sortBy", q.sortBy);
  p.set("order", q.sortOrder);
  if (q.showAll) p.set("showAll", "true");
  p.set("limit", String(q.pageSize));
  p.set("offset", String((q.page - 1) * q.pageSize));
  return p.toString();
}
