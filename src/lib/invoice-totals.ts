/**
 * src/lib/invoice-totals.ts
 *
 * Helper PUR de calcul des totaux d'une facture à partir d'un devis source.
 * Source de vérité unique pour le snapshot devis→facture, qui doit garantir
 * que les totaux affichés sur la facture correspondent exactement au devis.
 *
 * ⚠️  BUG #80 (NONNA) : avant ce helper, la route POST /api/factures
 * calculait la TVA sur `devis.totalHt` (HT BRUT avant remise), ce qui
 * donnait une TVA et un TTC surévalués sur les devis remisés.
 *
 * Convention :
 *   - Facture.totalHt = HT BRUT au prorata du devis (somme des composantes,
 *     remise NON déduite). Cohérent avec le rendu PDF qui calcule
 *     `totalHtNet = totalHt - remise` à l'affichage.
 *   - Facture.tva = (totalHt - remise) × tauxTva  ← sur le NET, comme le devis.
 *   - Facture.totalTtc = (totalHt - remise) + tva.
 *
 * Cette convention reproduit fidèlement la sémantique de `calculerDevis()`
 * dans calculations.ts : pour une facture SOLDE 100 % sans acompte,
 * facture.tva === devis.tva et facture.totalTtc === devis.totalTtc.
 */

export type FactureType = "ACOMPTE" | "SOLDE" | "AVOIR";

/** Champs nécessaires depuis le devis source. */
export interface DevisForFactureCompute {
  totalHt: number;        // HT brut (avant remise/coproduction)
  remise: number;         // Remise exceptionnelle (€)
  coproduction: number;   // Apport en industrie (€)
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  fraisGeneraux: number;
  marge: number;
  tauxTva: number;        // Pourcentage (20, 10, 5.5, 0)
}

export interface ComputeFactureTotalsInput {
  devis: DevisForFactureCompute;
  type: FactureType;
  /** Pourcentage de l'acompte (1..100). Ignoré pour SOLDE/AVOIR. */
  pourcentageAcompte?: number;
  /** Total HT BRUT déjà facturé en acomptes pour ce devis. Ignoré sauf SOLDE. */
  acomptesTotalHt?: number;
}

export interface FactureTotalsSnapshot {
  /** HT BRUT prorata (positif pour ACOMPTE/SOLDE, négatif pour AVOIR). */
  totalHt: number;
  /** Remise prorata. */
  remise: number;
  /** Coproduction prorata. */
  coproduction: number;
  /** HT NET = totalHt - remise (base TVA). Dérivable du PDF, exposé ici
   *  pour les tests et pour le rendu en clair. */
  totalHtNet: number;
  /** TVA = totalHtNet × tauxTva / 100. */
  tva: number;
  /** TTC = totalHtNet + tva. */
  totalTtc: number;
  /** Ratio prorata appliqué (totalHt facture / devis.totalHt). Exposé pour
   *  debug — les composantes ci-dessous sont déjà arrondies. */
  ratio: number;
  /** Décomposition au prorata, identique à celle du devis. */
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  fraisGeneraux: number;
  marge: number;
  baseMarge: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcule les totaux complets d'une facture en snapshot depuis un devis.
 * Pure : aucun side effect, aucune dépendance Prisma/Clerk. Testable.
 *
 * Règles :
 *   - ACOMPTE : totalHt brut = devis.totalHt × pourcentage / 100
 *   - SOLDE   : totalHt brut = devis.totalHt - acomptesTotalHt
 *   - AVOIR   : totalHt brut = -devis.totalHt
 * Puis remise prorata, et TVA sur (totalHt - remise). Toutes les
 * composantes sont prorata via le ratio.
 */
export function computeFactureTotalsFromDevis(
  input: ComputeFactureTotalsInput
): FactureTotalsSnapshot {
  const { devis, type } = input;

  // 1. Montant HT BRUT facturé selon le type
  let totalHt: number;
  if (type === "ACOMPTE") {
    const pct = input.pourcentageAcompte ?? 50;
    totalHt = round2(devis.totalHt * (pct / 100));
  } else if (type === "AVOIR") {
    totalHt = round2(-devis.totalHt);
  } else {
    // SOLDE
    totalHt = round2(devis.totalHt - (input.acomptesTotalHt ?? 0));
  }

  // 2. Ratio prorata pour les composantes (signé pour AVOIR)
  const ratio = devis.totalHt > 0 ? totalHt / devis.totalHt : 0;

  // 3. Composantes au prorata
  const sousTotal      = round2(devis.sousTotal      * ratio);
  const csComedien     = round2(devis.csComedien     * ratio);
  const csTechniciens  = round2(devis.csTechniciens  * ratio);
  const fraisGeneraux  = round2(devis.fraisGeneraux  * ratio);
  const marge          = round2(devis.marge          * ratio);
  const remise         = round2(devis.remise         * ratio);
  const coproduction   = round2(devis.coproduction   * ratio);
  const baseMarge      = round2(sousTotal + csTechniciens);

  // 4. HT NET = base TVA. ⚠️ C'est ici que le bug pré-fix se cachait :
  // l'ancien code utilisait totalHt (BRUT) au lieu de (totalHt - remise).
  // On reproduit fidèlement la convention de calculerDevis() :
  //   totalApresRemise = totalHt - remise (- coproduction)
  // Note : coproduction est aussi déductible côté devis (cf. calculations.ts
  // ligne 91), mais l'ancien snapshot facture ne la déduisait pas non plus.
  // On garde le comportement pré-existant pour la coproduction (déduite
  // au prorata dans la décomposition affichée mais PAS dans le HT net pour
  // la TVA) — sinon on changerait deux choses à la fois. À traiter dans un
  // ticket séparé si Vanda le signale.
  const totalHtNet = round2(totalHt - remise);

  // 5. TVA + TTC
  const tauxTva = devis.tauxTva ?? 20;
  const tva = round2(totalHtNet * (tauxTva / 100));
  const totalTtc = round2(totalHtNet + tva);

  return {
    totalHt,
    remise,
    coproduction,
    totalHtNet,
    tva,
    totalTtc,
    ratio,
    sousTotal,
    csComedien,
    csTechniciens,
    fraisGeneraux,
    marge,
    baseMarge,
  };
}

// ─────────────────────────────────────────────
// FACTURE RÉCAPITULATIVE MULTI-DEVIS (#99)
// ─────────────────────────────────────────────

/** Snapshot par devis source, exposé pour le PDF récap et les tests. */
export interface PerDevisSnapshot {
  totalHt: number;    // HT BRUT du devis (facturé à 100 %)
  remise: number;
  totalHtNet: number; // HT NET = totalHt - remise (base TVA)
  tva: number;
  totalTtc: number;
  tauxTva: number;
}

export interface MultiDevisFactureTotals {
  /** Σ totalHt BRUT de chaque devis. */
  totalHt: number;
  remise: number;
  coproduction: number;
  /** Σ (totalHt - remise) de chaque devis — base TVA agrégée. */
  totalHtNet: number;
  /** Σ TVA calculée PAR DEVIS puis sommée (préserve le fix #80 et la remise
   *  propre à chaque devis). */
  tva: number;
  totalTtc: number;
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  fraisGeneraux: number;
  marge: number;
  baseMarge: number;
  /** Taux TVA commun. La route #99 garantit l'uniformité (400 sinon) ; la
   *  valeur renvoyée est celle du 1er devis. */
  tauxTva: number;
  /** Détail par devis (dans l'ordre d'entrée) pour le rendu PDF ligne à ligne. */
  perDevis: PerDevisSnapshot[];
}

/**
 * Vrai si tous les devis partagent le même taux de TVA. Garde-fou métier #99 :
 * le PDF et le Factur-X sont mono-taux, on refuse (400) une facture récap qui
 * mélangerait des taux. Comparaison sur le taux normalisé (défaut 20).
 */
export function haveUniformTvaRate(
  devisList: Array<Pick<DevisForFactureCompute, "tauxTva">>
): boolean {
  if (devisList.length === 0) return true;
  const first = devisList[0].tauxTva ?? 20;
  return devisList.every((d) => (d.tauxTva ?? 20) === first);
}

/**
 * Agrège les totaux d'une facture RÉCAPITULATIVE à partir de N devis, chacun
 * facturé à 100 % (pas d'acompte en V1). Pure, sans side effect.
 *
 * Méthode : réutilise computeFactureTotalsFromDevis(type: SOLDE, sans acompte)
 * pour CHAQUE devis, puis somme. La TVA est donc calculée par devis sur son HT
 * NET (post-remise, taux du devis) AVANT sommation — ce qui préserve
 * exactement le fix bug #80 et la remise propre à chaque devis, et resterait
 * correct même si un jour on autorisait des taux mixtes.
 *
 * Précondition (garantie par la route) : devisList non vide et taux TVA
 * uniforme (cf. haveUniformTvaRate). Le champ tauxTva renvoyé est celui du 1er.
 */
export function computeFactureTotalsFromMultipleDevis(
  devisList: DevisForFactureCompute[]
): MultiDevisFactureTotals {
  if (devisList.length === 0) {
    throw new Error("computeFactureTotalsFromMultipleDevis: au moins un devis requis");
  }

  const per = devisList.map((devis) => {
    const t = computeFactureTotalsFromDevis({ devis, type: "SOLDE", acomptesTotalHt: 0 });
    const snap: PerDevisSnapshot = {
      totalHt: t.totalHt,
      remise: t.remise,
      totalHtNet: t.totalHtNet,
      tva: t.tva,
      totalTtc: t.totalTtc,
      tauxTva: devis.tauxTva ?? 20,
    };
    return { t, snap };
  });

  const sum = (pick: (t: FactureTotalsSnapshot) => number): number =>
    round2(per.reduce((acc, p) => acc + pick(p.t), 0));

  return {
    totalHt:       sum((t) => t.totalHt),
    remise:        sum((t) => t.remise),
    coproduction:  sum((t) => t.coproduction),
    totalHtNet:    sum((t) => t.totalHtNet),
    tva:           sum((t) => t.tva),
    totalTtc:      sum((t) => t.totalTtc),
    sousTotal:     sum((t) => t.sousTotal),
    csComedien:    sum((t) => t.csComedien),
    csTechniciens: sum((t) => t.csTechniciens),
    fraisGeneraux: sum((t) => t.fraisGeneraux),
    marge:         sum((t) => t.marge),
    baseMarge:     sum((t) => t.baseMarge),
    tauxTva:       devisList[0].tauxTva ?? 20,
    perDevis:      per.map((p) => p.snap),
  };
}
