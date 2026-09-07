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
