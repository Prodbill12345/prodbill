/**
 * src/lib/devis-facturation-state.ts
 *
 * GUARD-DEVIS-DOUBLE-FACTURATION — prédicat PUR décidant ce qu'un devis peut
 * encore être facturé, à partir des factures qui le couvrent déjà.
 *
 * Règle métier (matrice validée avec Vanda) : un devis peut avoir AU PLUS
 *   - UN acompte + UN solde, OU
 *   - UN solde à 100 % seul, OU
 *   - appartenir à UNE facture récapitulative (qui est un solde à 100 %).
 * Jamais deux pièces couvrant le même montant. Le flux acompte + solde reste
 * donc légitime — c'est la seule combinaison à deux factures autorisée.
 *
 * Conventions de comptage :
 *   - La source de vérité est la table de liaison FactureDevis (mono ET récap,
 *     cf. #99). Côté devis : `factureLinks`.
 *   - Les BROUILLONS COMPTENT. Sinon le trou reste ouvert : on pourrait créer
 *     dix brouillons de solde puis les émettre un par un. La contrepartie est
 *     que la suppression d'un brouillon RE-LIBÈRE le devis (cascade
 *     onDelete: Cascade sur FactureDevis + canDeleteFacture) — d'où les
 *     messages d'erreur qui nomment explicitement cette sortie.
 *   - Les AVOIR et les factures ANNULEE ne comptent pas (comportement déjà en
 *     place côté récap depuis #99 ; le traitement du flux d'avoir lui-même est
 *     hors périmètre de ce ticket).
 *   - Une récap a `type = SOLDE` : du point de vue du devis, elle occupe donc
 *     la place du solde. `isRecap` ne sert qu'à produire un message parlant.
 *
 * Source de vérité partagée entre le gate serveur (POST /api/factures et
 * /api/factures/recap), l'affichage des boutons Acompte/Solde (DevisActions)
 * et la sélection multi-devis de la récap (DevisListClient) — même pattern que
 * isDevisFacturable / canDeleteFacture.
 */

import type { FactureStatut, FactureType } from "@prisma/client";

/** Une facture liée au devis, telle que vue par le garde-fou. */
export interface FactureForFacturation {
  type: FactureType;
  statut: FactureStatut;
  /**
   * Facture récapitulative multi-devis (cf. isRecapFacture). Purement cosmétique
   * : change le message d'erreur, pas la décision. Optionnel — les appelants qui
   * ne chargent pas l'info laissent `false`.
   */
  isRecap?: boolean;
}

/** Pièce occupant déjà une place sur le devis. */
export interface FacturationSlot {
  exists: boolean;
  /** La pièce bloquante est un BROUILLON → supprimable pour re-libérer le devis. */
  isDraft: boolean;
  /** La pièce bloquante est une facture récapitulative. */
  isRecap: boolean;
}

export interface FacturationState {
  acompte: FacturationSlot;
  solde: FacturationSlot;
  /** Le devis est couvert par au moins une pièce (acompte ou solde). */
  isInvoiced: boolean;
  canCreateAcompte: boolean;
  canCreateSolde: boolean;
  /** Motif du blocage, prêt à afficher. NULL si l'action est autorisée. */
  acompteBlockedReason: string | null;
  soldeBlockedReason: string | null;
  /** Le devis peut-il entrer dans une facture récapitulative ? (règle V1) */
  canJoinRecap: boolean;
  recapBlockedReason: string | null;
}

/** Suffixe nommant la sortie quand la pièce bloquante est un brouillon. */
function exit(slot: FacturationSlot, what: string): string {
  return slot.isDraft
    ? ` Supprimez ${what} pour re-libérer ce devis.`
    : "";
}

function emptySlot(): FacturationSlot {
  return { exists: false, isDraft: false, isRecap: false };
}

/**
 * Réduit les factures liées à un devis en un état de facturation exploitable
 * par le serveur comme par l'UI.
 *
 * @param factures Factures liées au devis (via FactureDevis, mono + récap).
 *                 Les AVOIR / ANNULEE peuvent être passés : ils sont ignorés.
 */
export function getFacturationState(
  factures: FactureForFacturation[]
): FacturationState {
  const acompte = emptySlot();
  const solde = emptySlot();

  for (const f of factures) {
    // Hors périmètre : un avoir n'occupe pas de place, une facture annulée non
    // plus. Même filtre que la dérivation récap d'origine (#99).
    if (f.type === "AVOIR" || f.statut === "ANNULEE") continue;

    const slot = f.type === "ACOMPTE" ? acompte : solde;
    // Un brouillon n'« écrase » pas une pièce émise déjà enregistrée : dès
    // qu'une pièce émise occupe le slot, le blocage est définitif (pas de
    // sortie par suppression).
    if (slot.exists && !slot.isDraft) {
      continue;
    }
    slot.exists = true;
    slot.isDraft = f.statut === "BROUILLON";
    slot.isRecap = f.isRecap === true;
  }

  const soldeLabel = solde.isRecap
    ? "une facture récapitulative"
    : "une facture de solde";
  const soldeExit = exit(
    solde,
    solde.isRecap ? "le brouillon de récapitulatif" : "le brouillon de solde"
  );

  // ── Acompte ────────────────────────────────────────────────────────────
  let acompteBlockedReason: string | null = null;
  if (acompte.exists) {
    acompteBlockedReason =
      `Ce devis a déjà un acompte${acompte.isDraft ? " en brouillon" : " facturé"}.` +
      exit(acompte, "le brouillon d'acompte existant");
  } else if (solde.exists) {
    // Acompte APRÈS solde : le solde couvre déjà 100 % (ou le reste), un
    // acompte n'a plus de place — il ferait doublon sur le même montant.
    acompteBlockedReason =
      `Ce devis est déjà couvert par ${soldeLabel}${solde.isDraft ? " en brouillon" : ""} : ` +
      `un acompte ne peut plus être créé après le solde.` +
      soldeExit;
  }

  // ── Solde ──────────────────────────────────────────────────────────────
  // Un acompte seul n'empêche PAS le solde : c'est le flux légitime.
  let soldeBlockedReason: string | null = null;
  if (solde.exists) {
    soldeBlockedReason =
      `Ce devis a déjà ${soldeLabel}${solde.isDraft ? " en brouillon" : ""}.` + soldeExit;
  }

  // ── Récap (règle V1 inchangée) ─────────────────────────────────────────
  // Un devis acompté reste exclu de la récap : la déduction d'acompte n'est
  // pas gérée en V1. Un devis déjà soldé/récapitulé l'est aussi.
  let recapBlockedReason: string | null = null;
  if (acompte.exists) {
    recapBlockedReason =
      `Ce devis a déjà un acompte${acompte.isDraft ? " en brouillon" : " facturé"} : ` +
      `il ne peut pas entrer dans une facture récapitulative (non géré en V1, ` +
      `facturez son solde séparément).` +
      exit(acompte, "le brouillon d'acompte");
  } else if (solde.exists) {
    recapBlockedReason =
      `Ce devis a déjà ${soldeLabel}${solde.isDraft ? " en brouillon" : ""}.` + soldeExit;
  }

  return {
    acompte,
    solde,
    isInvoiced: acompte.exists || solde.exists,
    canCreateAcompte: acompteBlockedReason === null,
    canCreateSolde: soldeBlockedReason === null,
    acompteBlockedReason,
    soldeBlockedReason,
    canJoinRecap: recapBlockedReason === null,
    recapBlockedReason,
  };
}

/**
 * Select Prisma minimal alimentant getFacturationState. Partagé par les routes
 * et les pages pour que mono, récap et UI lisent exactement les mêmes champs.
 * `devisId` + le compte de liens servent à détecter une récap (isRecapFacture).
 */
export const FACTURE_FACTURATION_SELECT = {
  type: true,
  statut: true,
  devisId: true,
  _count: { select: { devisLinks: true } },
} as const;

/** Mappe une ligne Prisma (FACTURE_FACTURATION_SELECT) vers l'entrée du prédicat. */
export function toFactureForFacturation(f: {
  type: FactureType;
  statut: FactureStatut;
  devisId: string | null;
  _count: { devisLinks: number };
}): FactureForFacturation {
  return {
    type: f.type,
    statut: f.statut,
    // Même définition que isRecapFacture() : devisId NULL + ≥ 2 devis liés.
    isRecap: f.devisId === null && f._count.devisLinks >= 2,
  };
}
