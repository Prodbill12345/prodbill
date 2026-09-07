/**
 * src/lib/facture-recap.ts
 *
 * Règles métier PURES de la facture récapitulative multi-devis (#99).
 * Décision testable, sans dépendance Prisma/Clerk — la route charge les devis
 * et l'état "déjà facturé" depuis la DB, puis délègue la validation ici.
 *
 * Règles V1 (validées avec Vanda) :
 *   - Au moins 2 devis (sinon → facture mono classique).
 *   - Même client obligatoire.
 *   - Chaque devis doit être VALIDE ou ACCEPTE (isDevisFacturable).
 *   - Un devis déjà acompté est refusé (déduction d'acompte non gérée en V1).
 *   - Un devis déjà facturé (solde/récap) est refusé (anti double-facturation).
 *   - Taux de TVA uniforme (PDF + Factur-X mono-taux) — sinon refus explicite.
 */

import type { DevisStatut } from "@prisma/client";
import { isDevisFacturable } from "./devis-facturable";
import { haveUniformTvaRate } from "./invoice-totals";

export interface RecapDevisInput {
  id: string;
  numero: string | null;
  clientId: string;
  statut: DevisStatut;
  tauxTva: number;
  /** A déjà un acompte facturé (facture ACOMPTE non annulée). */
  alreadyHasAcompte: boolean;
  /** A déjà été facturé (facture non-avoir non-annulée, acompte inclus). */
  alreadyInvoiced: boolean;
}

export type RecapValidation =
  | { ok: true; clientId: string }
  | { ok: false; error: string };

function label(d: RecapDevisInput): string {
  return d.numero ? `n° ${d.numero}` : "(brouillon sans numéro)";
}

export function validateRecapDevisSet(devisList: RecapDevisInput[]): RecapValidation {
  if (devisList.length < 2) {
    return {
      ok: false,
      error: "Une facture récapitulative requiert au moins 2 devis.",
    };
  }

  const clientId = devisList[0].clientId;
  if (!devisList.every((d) => d.clientId === clientId)) {
    return {
      ok: false,
      error:
        "Tous les devis d'une facture récapitulative doivent appartenir au même client.",
    };
  }

  const notFacturable = devisList.find((d) => !isDevisFacturable(d.statut));
  if (notFacturable) {
    return {
      ok: false,
      error: `Le devis ${label(notFacturable)} doit être validé, envoyé ou accepté pour être facturé.`,
    };
  }

  // Acompte : message explicite (cas exclu de la V1).
  const withAcompte = devisList.find((d) => d.alreadyHasAcompte);
  if (withAcompte) {
    return {
      ok: false,
      error: `Le devis ${label(withAcompte)} a déjà un acompte facturé : il ne peut pas entrer dans une facture récapitulative (non géré en V1, facturez son solde séparément).`,
    };
  }

  const invoiced = devisList.find((d) => d.alreadyInvoiced);
  if (invoiced) {
    return {
      ok: false,
      error: `Le devis ${label(invoiced)} a déjà été facturé.`,
    };
  }

  if (!haveUniformTvaRate(devisList)) {
    return {
      ok: false,
      error:
        "Les devis sélectionnés ont des taux de TVA différents, facturez-les séparément.",
    };
  }

  return { ok: true, clientId };
}

/** Devis lié, tel que vu au moment d'émettre la facture. */
export interface EmittableDevisInput {
  numero: string | null;
  statut: DevisStatut;
  clientId: string;
  tauxTva: number;
  /** Déjà ÉMIS dans une AUTRE facture (non-avoir) → double-facturation. */
  emittedElsewhere: boolean;
}

export type EmitValidation = { ok: true } | { ok: false; error: string };

/**
 * Garde-fou d'ÉMISSION (#99 BUG-RECAP-BROUILLON-STALE) : entre la création du
 * brouillon et son émission, un devis lié peut avoir changé d'état (repassé en
 * BROUILLON, REFUSE…), de taux de TVA, ou avoir été émis ailleurs. On revalide
 * avant de figer. `isRecap` active les contrôles multi-devis (même client, taux
 * TVA uniforme). Une facture sans devis lié (import) n'appelle pas ce contrôle.
 */
export function validateFactureEmittable(params: {
  isRecap: boolean;
  devis: EmittableDevisInput[];
}): EmitValidation {
  const { isRecap, devis } = params;
  if (devis.length === 0) return { ok: true }; // facture sans devis (import) : rien à revalider

  const notFacturable = devis.find((d) => !isDevisFacturable(d.statut));
  if (notFacturable) {
    return {
      ok: false,
      error: `Le devis ${devisLabel(notFacturable.numero)} n'est plus facturable (statut ${notFacturable.statut}) — impossible d'émettre. Rétablissez-le ou retirez-le de la facture.`,
    };
  }

  const emitted = devis.find((d) => d.emittedElsewhere);
  if (emitted) {
    return {
      ok: false,
      error: `Le devis ${devisLabel(emitted.numero)} a déjà été facturé (émis) dans une autre facture.`,
    };
  }

  if (isRecap) {
    const clientId = devis[0].clientId;
    if (!devis.every((d) => d.clientId === clientId)) {
      return { ok: false, error: "Les devis liés n'ont plus le même client." };
    }
    if (!haveUniformTvaRate(devis)) {
      return {
        ok: false,
        error:
          "Les devis liés ont des taux de TVA différents, facturez-les séparément.",
      };
    }
  }
  return { ok: true };
}

function devisLabel(numero: string | null): string {
  return numero ? `n° ${numero}` : "(brouillon sans numéro)";
}
