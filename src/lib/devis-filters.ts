/**
 * src/lib/devis-filters.ts
 *
 * Filtrage et URL state du listing /devis. Pure functions testables :
 *
 *   - `filterDevis(list, filters)` : applique tous les filtres
 *   - `filtersToParams(filters)`   : URLSearchParams pour router.replace
 *   - `paramsToFilters(params)`    : parse l'URL initial
 *
 * Convention :
 *   - Tous les filtres sont optionnels. Une chaîne vide ou undefined
 *     veut dire "filtre inactif" — pas de contrainte appliquée.
 *   - L'URL ne contient JAMAIS les filtres vides (URL propre).
 *   - Le filtrage est case-insensitive sur les recherches texte.
 *
 * Pour l'année : on accepte d'abord `Devis.annee` (saisi manuellement
 * sur le formulaire), puis fallback sur `year(dateEmission)`. La quasi-
 * totalité des devis Caleson importés ont `annee = null` ; sans le
 * fallback, le filtre serait inutilisable pour eux.
 */

import type { DevisStatut } from "@prisma/client";
import type { SortAccessor, SortState } from "./list-sort";

export interface DevisFilters {
  q?: string;                 // recherche libre (numéro + client + objet)
  statut?: DevisStatut | "";
  annee?: number;             // year (UTC) à matcher
  dateEmissionFrom?: string;  // "YYYY-MM-DD" inclusif borne basse
  dateEmissionTo?: string;    // "YYYY-MM-DD" inclusif borne haute
  totalTtcMin?: number;
  totalTtcMax?: number;
  bdcNumero?: string;         // substring case-insensitive
}

export interface DevisFilterable {
  numero: string | null;
  objet: string;
  client: { name: string };
  statut: DevisStatut;
  annee: number | null;
  dateEmission: Date | null;
  totalTtc: number;
  bdc?: { numero: string } | null;
}

function getDevisYear(d: DevisFilterable): number | null {
  if (d.annee !== null && d.annee !== undefined) return d.annee;
  if (d.dateEmission) return d.dateEmission.getUTCFullYear();
  return null;
}

export function filterDevis<T extends DevisFilterable>(
  list: T[],
  f: DevisFilters
): T[] {
  return list.filter((d) => {
    // Recherche libre globale : numéro + nom client + objet
    if (f.q && f.q.trim() !== "") {
      const q = f.q.trim().toLowerCase();
      const hay = [d.numero ?? "", d.client.name, d.objet]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    // Statut exact
    if (f.statut && d.statut !== f.statut) return false;

    // Année : Devis.annee prioritaire, sinon year(dateEmission)
    if (f.annee !== undefined && f.annee !== null) {
      const y = getDevisYear(d);
      if (y !== f.annee) return false;
    }

    // Plage dateEmission [from, to] inclusive
    if (f.dateEmissionFrom) {
      if (!d.dateEmission) return false;
      const from = new Date(f.dateEmissionFrom + "T00:00:00.000Z");
      if (d.dateEmission < from) return false;
    }
    if (f.dateEmissionTo) {
      if (!d.dateEmission) return false;
      const to = new Date(f.dateEmissionTo + "T23:59:59.999Z");
      if (d.dateEmission > to) return false;
    }

    // Plage TTC [min, max] inclusive
    if (f.totalTtcMin !== undefined && d.totalTtc < f.totalTtcMin) return false;
    if (f.totalTtcMax !== undefined && d.totalTtc > f.totalTtcMax) return false;

    // N° BDC (substring case-insensitive)
    if (f.bdcNumero && f.bdcNumero.trim() !== "") {
      const num = d.bdc?.numero ?? "";
      if (!num.toLowerCase().includes(f.bdcNumero.trim().toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sérialise les filtres en URLSearchParams. Les valeurs vides sont
 * OMISES de l'URL (URL propre).
 */
export function filtersToParams(f: DevisFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.statut) p.set("statut", f.statut);
  if (f.annee !== undefined && f.annee !== null) p.set("annee", String(f.annee));
  if (f.dateEmissionFrom) p.set("dateEmissionFrom", f.dateEmissionFrom);
  if (f.dateEmissionTo) p.set("dateEmissionTo", f.dateEmissionTo);
  if (f.totalTtcMin !== undefined) p.set("totalTtcMin", String(f.totalTtcMin));
  if (f.totalTtcMax !== undefined) p.set("totalTtcMax", String(f.totalTtcMax));
  if (f.bdcNumero && f.bdcNumero.trim()) p.set("bdcNumero", f.bdcNumero.trim());
  return p;
}

/**
 * Parse une URLSearchParams (ou un ReadonlyURLSearchParams) en filtres.
 * Les paramètres absents ou mal formés sont ignorés (filtre inactif).
 */
export function paramsToFilters(p: URLSearchParams | { get: (k: string) => string | null }): DevisFilters {
  const f: DevisFilters = {};
  const get = (k: string) => p.get(k);
  const q = get("q");
  if (q) f.q = q;
  const statut = get("statut") as DevisStatut | null;
  if (statut) f.statut = statut;
  const annee = get("annee");
  if (annee) {
    const n = parseInt(annee, 10);
    if (Number.isFinite(n)) f.annee = n;
  }
  const from = get("dateEmissionFrom");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) f.dateEmissionFrom = from;
  const to = get("dateEmissionTo");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) f.dateEmissionTo = to;
  const min = get("totalTtcMin");
  if (min) {
    const n = parseFloat(min);
    if (Number.isFinite(n)) f.totalTtcMin = n;
  }
  const max = get("totalTtcMax");
  if (max) {
    const n = parseFloat(max);
    if (Number.isFinite(n)) f.totalTtcMax = n;
  }
  const bdc = get("bdcNumero");
  if (bdc) f.bdcNumero = bdc;
  return f;
}

/**
 * `true` si au moins un filtre est actif. Utile pour afficher /
 * cacher le bouton "Effacer tous les filtres".
 */
// ─── Tri ──────────────────────────────────────────────────────────────────────

export const DEVIS_SORT_KEYS = [
  "numero",
  "client",
  "objet",
  "annee",
  "dateEmission",
  "totalTtc",
  "statut",
] as const;
export type DevisSortKey = typeof DEVIS_SORT_KEYS[number];

// Ordre métier : BROUILLON → ENVOYE → ACCEPTE → REFUSE → EXPIRE
const DEVIS_STATUT_ORDER: Record<DevisStatut, number> = {
  BROUILLON: 1,
  ENVOYE: 2,
  ACCEPTE: 3,
  REFUSE: 4,
  EXPIRE: 5,
};

export const DEVIS_SORT_ACCESSORS: Record<DevisSortKey, SortAccessor<DevisFilterable>> = {
  numero: (d) => d.numero ?? "",
  client: (d) => d.client.name,
  objet: (d) => d.objet,
  // Annee : champ saisi prioritaire, sinon year(dateEmission) — cf. filterDevis
  annee: (d) => d.annee ?? d.dateEmission?.getUTCFullYear() ?? null,
  dateEmission: (d) => d.dateEmission,
  totalTtc: (d) => d.totalTtc,
  statut: (d) => DEVIS_STATUT_ORDER[d.statut] ?? 999,
};

export const DEVIS_DEFAULT_SORT: SortState<DevisSortKey> = {
  key: "dateEmission",
  order: "desc",
};

export function hasActiveFilters(f: DevisFilters): boolean {
  return Boolean(
    (f.q && f.q.trim()) ||
    f.statut ||
    f.annee !== undefined ||
    f.dateEmissionFrom ||
    f.dateEmissionTo ||
    f.totalTtcMin !== undefined ||
    f.totalTtcMax !== undefined ||
    (f.bdcNumero && f.bdcNumero.trim())
  );
}
