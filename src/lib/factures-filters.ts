/**
 * src/lib/factures-filters.ts
 *
 * Filtrage et URL state du listing /factures. Pure functions testables.
 * Suit le même pattern que `src/lib/devis-filters.ts` mais avec :
 *   - `FactureType` (ACOMPTE / SOLDE / AVOIR) en plus
 *   - 3 ranges de dates (émission, échéance, règlement) au lieu d'une
 *   - pas de champ `annee` sur Facture → on dérive depuis `dateEmission`
 *   - recherche libre étendue au numéro du devis source et à son objet
 *     (Facture.devis?.numero / objet)
 *   - `numeroBdc` direct (string field sur Facture, pas une relation)
 */

import type { FactureStatut, FactureType } from "@prisma/client";

export interface FacturesFilters {
  q?: string;                    // recherche libre
  statut?: FactureStatut | "";
  type?: FactureType | "";
  annee?: number;                // year(dateEmission)
  dateEmissionFrom?: string;     // "YYYY-MM-DD" inclusif
  dateEmissionTo?: string;
  dateEcheanceFrom?: string;
  dateEcheanceTo?: string;
  dateReglementFrom?: string;
  dateReglementTo?: string;
  totalTtcMin?: number;
  totalTtcMax?: number;
  bdcNumero?: string;            // substring case-insensitive
}

export interface FactureFilterable {
  numero: string;
  numeroBdc: string | null;
  type: FactureType;
  statut: FactureStatut;
  dateEmission: Date | null;
  dateEcheance: Date | null;
  dateReglement: Date | null;
  totalTtc: number;
  client: { name: string };
  devis?: { numero: string | null; objet: string } | null;
}

function inDateRange(
  date: Date | null,
  fromIso?: string,
  toIso?: string
): boolean {
  if (!fromIso && !toIso) return true;
  if (!date) return false;
  if (fromIso) {
    const from = new Date(fromIso + "T00:00:00.000Z");
    if (date < from) return false;
  }
  if (toIso) {
    const to = new Date(toIso + "T23:59:59.999Z");
    if (date > to) return false;
  }
  return true;
}

export function filterFactures<T extends FactureFilterable>(
  list: T[],
  f: FacturesFilters
): T[] {
  return list.filter((d) => {
    // Recherche libre : facture.numero + client.name + devis.numero + devis.objet
    if (f.q && f.q.trim() !== "") {
      const q = f.q.trim().toLowerCase();
      const hay = [
        d.numero,
        d.client.name,
        d.devis?.numero ?? "",
        d.devis?.objet ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (f.statut && d.statut !== f.statut) return false;
    if (f.type && d.type !== f.type) return false;

    // Année : year(dateEmission) — pas de champ annee sur Facture
    if (f.annee !== undefined && f.annee !== null) {
      const y = d.dateEmission ? d.dateEmission.getUTCFullYear() : null;
      if (y !== f.annee) return false;
    }

    // 3 ranges de dates indépendants
    if (!inDateRange(d.dateEmission, f.dateEmissionFrom, f.dateEmissionTo)) return false;
    if (!inDateRange(d.dateEcheance, f.dateEcheanceFrom, f.dateEcheanceTo)) return false;
    if (!inDateRange(d.dateReglement, f.dateReglementFrom, f.dateReglementTo)) return false;

    if (f.totalTtcMin !== undefined && d.totalTtc < f.totalTtcMin) return false;
    if (f.totalTtcMax !== undefined && d.totalTtc > f.totalTtcMax) return false;

    if (f.bdcNumero && f.bdcNumero.trim() !== "") {
      const num = d.numeroBdc ?? "";
      if (!num.toLowerCase().includes(f.bdcNumero.trim().toLowerCase())) {
        return false;
      }
    }

    return true;
  });
}

export function filtersToParams(f: FacturesFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.statut) p.set("statut", f.statut);
  if (f.type) p.set("type", f.type);
  if (f.annee !== undefined && f.annee !== null) p.set("annee", String(f.annee));
  if (f.dateEmissionFrom) p.set("dateEmissionFrom", f.dateEmissionFrom);
  if (f.dateEmissionTo) p.set("dateEmissionTo", f.dateEmissionTo);
  if (f.dateEcheanceFrom) p.set("dateEcheanceFrom", f.dateEcheanceFrom);
  if (f.dateEcheanceTo) p.set("dateEcheanceTo", f.dateEcheanceTo);
  if (f.dateReglementFrom) p.set("dateReglementFrom", f.dateReglementFrom);
  if (f.dateReglementTo) p.set("dateReglementTo", f.dateReglementTo);
  if (f.totalTtcMin !== undefined) p.set("totalTtcMin", String(f.totalTtcMin));
  if (f.totalTtcMax !== undefined) p.set("totalTtcMax", String(f.totalTtcMax));
  if (f.bdcNumero && f.bdcNumero.trim()) p.set("bdcNumero", f.bdcNumero.trim());
  return p;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function paramsToFilters(
  p: URLSearchParams | { get: (k: string) => string | null }
): FacturesFilters {
  const f: FacturesFilters = {};
  const get = (k: string) => p.get(k);

  const q = get("q");
  if (q) f.q = q;

  const statut = get("statut") as FactureStatut | null;
  if (statut) f.statut = statut;

  const type = get("type") as FactureType | null;
  if (type) f.type = type;

  const annee = get("annee");
  if (annee) {
    const n = parseInt(annee, 10);
    if (Number.isFinite(n)) f.annee = n;
  }

  for (const k of [
    "dateEmissionFrom",
    "dateEmissionTo",
    "dateEcheanceFrom",
    "dateEcheanceTo",
    "dateReglementFrom",
    "dateReglementTo",
  ] as const) {
    const v = get(k);
    if (v && DATE_RE.test(v)) (f as Record<string, string>)[k] = v;
  }

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

export function hasActiveFilters(f: FacturesFilters): boolean {
  return Boolean(
    (f.q && f.q.trim()) ||
    f.statut ||
    f.type ||
    f.annee !== undefined ||
    f.dateEmissionFrom ||
    f.dateEmissionTo ||
    f.dateEcheanceFrom ||
    f.dateEcheanceTo ||
    f.dateReglementFrom ||
    f.dateReglementTo ||
    f.totalTtcMin !== undefined ||
    f.totalTtcMax !== undefined ||
    (f.bdcNumero && f.bdcNumero.trim())
  );
}
