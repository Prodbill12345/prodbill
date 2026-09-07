/**
 * src/lib/facture-recompute.ts  (#99 — BUG-RECAP-BROUILLON-STALE)
 *
 * Tant qu'une facture est BROUILLON, ses totaux doivent refléter l'état ACTUEL
 * des devis liés. Comme les totaux sont dénormalisés sur la facture (comme sur
 * le devis), on les RAFRAÎCHIT à chaque sauvegarde d'un devis lié (push depuis
 * PUT /api/devis/[id]) et on les FIGE à l'émission. Ainsi tous les points de
 * lecture (liste, détail, PDF, exports…) lisent des totaux à jour sans changer.
 *
 * Mono ET récap, même mécanisme. Ne touche JAMAIS une facture non-BROUILLON
 * (immuabilité légale art. 289 : le figement se fait à l'émission).
 */

import type { Prisma } from "@prisma/client";
import {
  computeFactureTotalsFromDevis,
  computeFactureTotalsFromMultipleDevis,
  type DevisForFactureCompute,
} from "./invoice-totals";
import { isRecapFacture } from "./facture-recap-view";

type Db = Prisma.TransactionClient;

// Champs du devis nécessaires au recalcul + à la validation d'émission.
export const DEVIS_RECOMPUTE_SELECT = {
  id: true,
  numero: true,
  statut: true,
  clientId: true,
  totalHt: true,
  remise: true,
  coproduction: true,
  sousTotal: true,
  csComedien: true,
  csTechniciens: true,
  fraisGeneraux: true,
  marge: true,
  tauxTva: true,
  tvaMention: true,
} as const;

type DevisRow = Prisma.DevisGetPayload<{ select: typeof DEVIS_RECOMPUTE_SELECT }>;

const FACTURE_RECOMPUTE_SELECT = {
  id: true,
  type: true,
  statut: true,
  devisId: true,
  totalHt: true,
  pourcentageAcompte: true,
  companyId: true,
  devisLinks: { select: { devis: { select: DEVIS_RECOMPUTE_SELECT } } },
} as const;

type FactureRow = Prisma.FactureGetPayload<{ select: typeof FACTURE_RECOMPUTE_SELECT }>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCompute(d: DevisRow): DevisForFactureCompute {
  return {
    totalHt: d.totalHt,
    remise: d.remise,
    coproduction: d.coproduction,
    sousTotal: d.sousTotal,
    csComedien: d.csComedien,
    csTechniciens: d.csTechniciens,
    fraisGeneraux: d.fraisGeneraux,
    marge: d.marge,
    tauxTva: d.tauxTva ?? 20,
  };
}

/** Bloc de totaux persistable sur la facture. */
export interface FacturePersistTotals {
  totalHt: number;
  tauxTva: number;
  tvaMention: string | null;
  tva: number;
  totalTtc: number;
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  baseMarge: number;
  fraisGeneraux: number;
  marge: number;
  remise: number;
  coproduction: number;
}

/**
 * Calcule (PUR) les totaux à jour d'une facture BROUILLON à partir de l'état
 * courant des devis liés. Retourne null si non calculable (aucun devis lié,
 * ou avoir). Réutilisé par le push (persist) et par l'émission (fige).
 */
export function computeFacturePersistTotals(
  facture: Pick<FactureRow, "type" | "devisId" | "totalHt" | "pourcentageAcompte">,
  devisRows: DevisRow[],
  acomptesTotalHt: number
): FacturePersistTotals | null {
  if (facture.type === "AVOIR") return null; // les avoirs sont émis directement
  if (devisRows.length === 0) return null;

  if (isRecapFacture(facture.devisId, devisRows.length)) {
    const t = computeFactureTotalsFromMultipleDevis(devisRows.map(toCompute));
    return {
      totalHt: t.totalHt,
      tauxTva: t.tauxTva,
      tvaMention: devisRows[0].tvaMention,
      tva: t.tva,
      totalTtc: t.totalTtc,
      sousTotal: t.sousTotal,
      csComedien: t.csComedien,
      csTechniciens: t.csTechniciens,
      baseMarge: t.baseMarge,
      fraisGeneraux: t.fraisGeneraux,
      marge: t.marge,
      remise: t.remise,
      coproduction: t.coproduction,
    };
  }

  const devis = devisRows[0];
  let pourcentageAcompte: number | undefined;
  if (facture.type === "ACOMPTE") {
    // % mémorisé (#99). Fallback legacy : dérivé du ratio courant (exact tant
    // que la facture n'a pas encore dérivé), défaut 50 si devis à 0.
    pourcentageAcompte =
      facture.pourcentageAcompte ??
      (devis.totalHt > 0 ? round2((facture.totalHt / devis.totalHt) * 100) : 50);
  }
  const t = computeFactureTotalsFromDevis({
    devis: toCompute(devis),
    type: facture.type,
    pourcentageAcompte,
    acomptesTotalHt,
  });
  return {
    totalHt: t.totalHt,
    tauxTva: devis.tauxTva ?? 20,
    tvaMention: devis.tvaMention,
    tva: t.tva,
    totalTtc: t.totalTtc,
    sousTotal: t.sousTotal,
    csComedien: t.csComedien,
    csTechniciens: t.csTechniciens,
    baseMarge: t.baseMarge,
    fraisGeneraux: t.fraisGeneraux,
    marge: t.marge,
    remise: t.remise,
    coproduction: t.coproduction,
  };
}

/**
 * Charge une facture + ses devis liés, et renvoie les totaux à jour + le
 * contexte (facture, devis) — SANS persister. Utilisé par l'émission (qui fige
 * les totaux dans le flip atomique et re-valide l'éligibilité).
 */
export async function loadFactureTotals(
  db: Db,
  factureId: string
): Promise<{ facture: FactureRow; devisRows: DevisRow[]; totals: FacturePersistTotals | null }> {
  const facture = await db.facture.findUniqueOrThrow({
    where: { id: factureId },
    select: FACTURE_RECOMPUTE_SELECT,
  });
  const devisRows = facture.devisLinks.map((l) => l.devis);

  let acomptesTotalHt = 0;
  if (
    facture.type === "SOLDE" &&
    facture.devisId &&
    !isRecapFacture(facture.devisId, devisRows.length)
  ) {
    const agg = await db.facture.aggregate({
      where: { devisId: facture.devisId, type: "ACOMPTE" },
      _sum: { totalHt: true },
    });
    acomptesTotalHt = agg._sum.totalHt ?? 0;
  }

  const totals = computeFacturePersistTotals(facture, devisRows, acomptesTotalHt);
  return { facture, devisRows, totals };
}

/**
 * Recalcule + persiste les totaux d'UNE facture si elle est BROUILLON.
 * No-op sinon (émise = figée). Idempotent.
 */
export async function recomputeBrouillonFacture(db: Db, factureId: string): Promise<void> {
  const { facture, totals } = await loadFactureTotals(db, factureId);
  if (facture.statut !== "BROUILLON" || !totals) return;
  await db.facture.update({ where: { id: factureId }, data: totals });
}

/**
 * Rafraîchit les totaux de toutes les factures BROUILLON liées à un devis
 * (mono via devisId, récap via FactureDevis). Appelé après une sauvegarde de
 * devis. Recalcule les ACOMPTE avant les SOLDE (le solde ré-agrège les
 * acomptes). En pratique 0 à 1 facture concernée.
 */
export async function refreshBrouillonFacturesForDevis(
  db: Db,
  companyId: string,
  devisId: string
): Promise<void> {
  const factures = await db.facture.findMany({
    where: {
      companyId,
      statut: "BROUILLON",
      OR: [{ devisId }, { devisLinks: { some: { devisId } } }],
    },
    select: { id: true, type: true },
  });
  const rank = (t: string) => (t === "ACOMPTE" ? 0 : 1);
  const ordered = [...factures].sort((a, b) => rank(a.type) - rank(b.type));
  for (const f of ordered) {
    await recomputeBrouillonFacture(db, f.id);
  }
}
