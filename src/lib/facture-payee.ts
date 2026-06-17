/**
 * src/lib/facture-payee.ts
 *
 * Helpers PURS pour le bouton "Marquer payée" / "Annuler le paiement"
 * (ticket #92).
 *
 * Sémantique : quand Vanda clique "Marquer payée", on cree (ou pas) un
 * objet Paiement avec un mode magique MARQUEE_MANUELLE pour distinguer
 * d'un paiement saisi en detail via le module paiement classique. Le
 * "unpay" supprime juste ces auto-paiements, jamais les vrais.
 *
 * Valeur magique : pas ideal architecturalement (un boolean dedie sur
 * Paiement serait plus propre) mais evite une migration et reste
 * lisible. A nettoyer en V3 quand on revisitera le module paiement.
 */

/** Mode utilise pour identifier un Paiement cree par le bouton "Marquer payée". */
export const PAIEMENT_MODE_MARQUEE_MANUELLE = "MARQUEE_MANUELLE";

export interface PaiementForCompute {
  /** Montant du paiement (euros). */
  montant: number;
  /** Mode du paiement. NULL accepte (anciens paiements sans mode). */
  mode: string | null;
}

/**
 * Decide ce que doit faire la route POST /api/factures/[id]/payee :
 *   - le reste a payer (= totalTtc - somme paiements existants)
 *   - le mode a utiliser pour le Paiement auto-cree
 *
 * Cas :
 *   1. resteAPayer > 0 : on cree un Paiement de ce montant avec mode
 *      MARQUEE_MANUELLE. C'est le cas le plus courant (Vanda recoit
 *      le virement et clic "Marquer payée").
 *   2. resteAPayer <= 0 : la facture est deja entierement payee par
 *      d'autres paiements. On ne cree rien — le statut sera juste
 *      basculé en PAYEE par la route (idempotence).
 */
export function computeMarquerPayeePlan(
  totalTtc: number,
  paiements: readonly PaiementForCompute[]
): {
  resteAPayer: number;
  shouldCreatePaiement: boolean;
  autoMontant: number;
  autoMode: string;
} {
  const totalPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const resteAPayer = round2(totalTtc - totalPaye);

  if (resteAPayer > 0) {
    return {
      resteAPayer,
      shouldCreatePaiement: true,
      autoMontant: resteAPayer,
      autoMode: PAIEMENT_MODE_MARQUEE_MANUELLE,
    };
  }
  return {
    resteAPayer,
    shouldCreatePaiement: false,
    autoMontant: 0,
    autoMode: PAIEMENT_MODE_MARQUEE_MANUELLE,
  };
}

/**
 * Decide si la route POST /api/factures/[id]/unpay peut s'executer.
 * Refus si la facture a au moins un Paiement non-MARQUEE_MANUELLE :
 * c'est probablement un vrai paiement saisi par Vanda via le module
 * detaille, qu'on ne veut PAS effacer par erreur.
 *
 * Retourne { ok: true, autoPaiementsIds } si l'annulation est sure,
 * ou { ok: false, message } sinon.
 */
export function canUnpayFacture(
  paiements: readonly (PaiementForCompute & { id: string })[]
):
  | { ok: true; autoPaiementsIds: string[] }
  | { ok: false; message: string } {
  const autoPaiements = paiements.filter(
    (p) => p.mode === PAIEMENT_MODE_MARQUEE_MANUELLE
  );
  const otherPaiements = paiements.filter(
    (p) => p.mode !== PAIEMENT_MODE_MARQUEE_MANUELLE
  );

  if (otherPaiements.length > 0) {
    return {
      ok: false,
      message:
        "Annulation impossible : cette facture a des paiements détaillés saisis manuellement. Supprimez-les d'abord depuis le module paiements.",
    };
  }

  return { ok: true, autoPaiementsIds: autoPaiements.map((p) => p.id) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
