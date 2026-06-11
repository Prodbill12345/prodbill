/**
 * src/lib/devis-duplicate.ts
 *
 * Helper PUR de duplication d'un devis. Transforme un devis source +
 * son arborescence sections/lignes en data Prisma pret pour
 * `prisma.devis.create({ data: ... })`. Aucune dependance Prisma client
 * ni I/O — testable directement.
 *
 * Regles (ticket #93) :
 *   - Tous les champs metier sont copies tels quels (lignes, sections,
 *     client, objet, periode d'exploitation, notes, taux FG/marge/remise,
 *     TVA, mention TVA, nomProjet, refDevis, annee, tauxCs*, etc.)
 *   - Reset des champs lies au cycle de vie :
 *       numero        = null  (re-genere a l'emission)
 *       statut        = BROUILLON
 *       dateEmission  = null  (Vanda saisit a la nouvelle emission)
 *       pdfUrl        = null  (PDF source non reutilise)
 *   - Reset des uploads non transposables :
 *       bdcClient*    = null  (le BDC client est specifique au devis source)
 *   - Tracabilite :
 *       devisSourceId = id du devis source
 *   - createdById = currentUserId (la duplication est un acte de creation)
 *   - companyId   = currentUserCompanyId (defensif, doit matcher source.companyId)
 *
 * Les totaux dénormalisés (totalHt, csComedien, baseMarge, marge, FG, tva,
 * totalTtc, totalApresRemise) sont copies tels quels — le snapshot du
 * source reste coherent. Ils seront recalcules au prochain save via
 * calculerDevis() dans la route PUT classique si Vanda modifie quoi que
 * ce soit.
 */

import type { Devis, DevisSection, DevisLigne, Prisma } from "@prisma/client";

export type DevisSourceForDuplicate = Devis & {
  sections: (DevisSection & { lignes: DevisLigne[] })[];
};

export interface DuplicateContext {
  currentUserId: string;
  currentCompanyId: string;
}

/**
 * Construit le `data` pour `prisma.devis.create({ data })`.
 * Lance une erreur si le source est dans une autre company que le current
 * user — garde-fou multi-tenant defensif (la route doit deja le verifier
 * via canAccessCompany, mais on ne fait pas confiance aveuglement).
 */
export function buildDuplicatedDevisData(
  source: DevisSourceForDuplicate,
  ctx: DuplicateContext
): Prisma.DevisCreateInput {
  if (source.companyId !== ctx.currentCompanyId) {
    throw new Error(
      "Refus de duplication : devis source dans une autre company que celle de l'user."
    );
  }

  return {
    // ─── Cycle de vie : reset ────────────────────────────────────────────
    numero: null,
    statut: "BROUILLON",
    dateEmission: null,
    pdfUrl: null,
    // BDC client : specifique au devis source, ne pas dupliquer
    bdcClientUrl: null,
    bdcClientFilename: null,
    bdcClientUploadedAt: null,

    // ─── Tracabilite ────────────────────────────────────────────────────
    devisSource: { connect: { id: source.id } },

    // ─── Multi-tenant ───────────────────────────────────────────────────
    company: { connect: { id: ctx.currentCompanyId } },
    createdById: ctx.currentUserId,

    // ─── Client + objet/projet ──────────────────────────────────────────
    client:      { connect: { id: source.clientId } },
    objet:       source.objet,
    description: source.description,
    nomProjet:   source.nomProjet,
    refDevis:    source.refDevis,
    annee:       source.annee,

    // ─── Taux CS / FG / Marge / TVA ─────────────────────────────────────
    tauxCsComedien: source.tauxCsComedien,
    tauxCsTech:     source.tauxCsTech,
    tauxFg:         source.tauxFg,
    tauxMarge:      source.tauxMarge,
    tauxTva:        source.tauxTva,
    tvaMention:     source.tvaMention,

    // ─── Totaux snapshot (recalcules au prochain save si modif) ─────────
    sousTotal:        source.sousTotal,
    csComedien:       source.csComedien,
    csTechniciens:    source.csTechniciens,
    baseMarge:        source.baseMarge,
    fraisGeneraux:    source.fraisGeneraux,
    marge:            source.marge,
    totalHt:          source.totalHt,
    remise:           source.remise,
    coproduction:     source.coproduction,
    totalApresRemise: source.totalApresRemise,
    tva:              source.tva,
    totalTtc:         source.totalTtc,

    // ─── Dates non-emission ─────────────────────────────────────────────
    dateValidite: source.dateValidite,
    dateSeance:   source.dateSeance,

    // ─── Periode d'exploitation (ticket #69) ────────────────────────────
    periodeExploitationDebut:    source.periodeExploitationDebut,
    periodeExploitationFin:      source.periodeExploitationFin,
    periodeExploitationLibelle:  source.periodeExploitationLibelle,

    // ─── Notes + suivi budgetaire ───────────────────────────────────────
    notes:    source.notes,
    tauxPipe: source.tauxPipe,

    // ─── Sections + lignes (deep copy, nouveaux ids generes par Prisma) ─
    sections: {
      create: source.sections.map((section) => ({
        companyId: ctx.currentCompanyId,
        titre: section.titre,
        ordre: section.ordre,
        lignes: {
          create: section.lignes.map((ligne) => ({
            companyId: ctx.currentCompanyId,
            libelle: ligne.libelle,
            tag: ligne.tag,
            quantite: ligne.quantite,
            prixUnit: ligne.prixUnit,
            total: ligne.total,
            tauxIndexation: ligne.tauxIndexation,
            comedienId: ligne.comedienId,
            agentId: ligne.agentId,
            paiementComedien: ligne.paiementComedien,
            horsMarge: ligne.horsMarge,
            ordre: ligne.ordre,
          })),
        },
      })),
    },
  };
}
