import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextDevisNumero } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { computeFactureTotalsFromMultipleDevis } from "@/lib/invoice-totals";
import { validateRecapDevisSet, type RecapDevisInput } from "@/lib/facture-recap";
import { z } from "zod";

/**
 * POST /api/factures/recap  (#99)
 *
 * Crée UNE facture récapitulative (brouillon) à partir de PLUSIEURS devis d'un
 * même client. Chaque devis est facturé à 100 % (type SOLDE, pas d'acompte en
 * V1). Le numéro F26XXX est attribué plus tard à l'émission (comme le mono).
 *
 * Garde-fous (400 explicites, cf. validateRecapDevisSet) : ≥ 2 devis, même
 * client, statut VALIDE/ACCEPTE, aucun devis déjà (acompté|facturé), taux TVA
 * uniforme. 404 si un devis est introuvable dans le tenant.
 */
const CreateRecapSchema = z.object({
  devisIds: z.array(z.string().min(1)).min(2),
  dateEcheance: z.string().optional(), // "YYYY-MM-DD"
});

export async function POST(req: Request) {
  try {
    const user = await requireAuth("facture:create");
    const body = await req.json();
    const input = CreateRecapSchema.parse(body);

    // Dédoublonnage défensif des ids (une checkbox ne peut pas être cochée 2×,
    // mais l'API est publique). On garde l'ordre de première apparition.
    const ids = [...new Set(input.devisIds)];
    if (ids.length < 2) {
      return Response.json(
        { error: "Une facture récapitulative requiert au moins 2 devis distincts." },
        { status: 400 }
      );
    }

    // Charger les devis du tenant, dans l'ordre demandé.
    const devisRows = await prisma.devis.findMany({
      where: { id: { in: ids }, companyId: user.companyId },
    });
    if (devisRows.length !== ids.length) {
      return Response.json(
        { error: "Un ou plusieurs devis sont introuvables." },
        { status: 404 }
      );
    }
    const byId = new Map(devisRows.map((d) => [d.id, d]));
    const devisList = ids.map((id) => byId.get(id)!);

    // État "déjà facturé" via la table de liaison (source de vérité, mono +
    // récap ; les avoirs et factures annulées ne comptent pas).
    const links = await prisma.factureDevis.findMany({
      where: { devisId: { in: ids } },
      select: { devisId: true, facture: { select: { type: true, statut: true } } },
    });
    const acompteSet = new Set<string>();
    const invoicedSet = new Set<string>();
    for (const l of links) {
      if (l.facture.statut === "ANNULEE" || l.facture.type === "AVOIR") continue;
      invoicedSet.add(l.devisId);
      if (l.facture.type === "ACOMPTE") acompteSet.add(l.devisId);
    }

    const validationInput: RecapDevisInput[] = devisList.map((d) => ({
      id: d.id,
      numero: d.numero,
      clientId: d.clientId,
      statut: d.statut,
      tauxTva: d.tauxTva ?? 20,
      alreadyHasAcompte: acompteSet.has(d.id),
      alreadyInvoiced: invoicedSet.has(d.id),
    }));

    const validation = validateRecapDevisSet(validationInput);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Matérialiser le numéro des devis qui n'en ont pas encore (un devis VALIDE
    // peut être sans numéro) — nécessaire pour la réf D26XXX sur le PDF récap.
    // Même logique que la route mono.
    for (const d of devisList) {
      if (!d.numero) {
        const numero = await getNextDevisNumero(user.companyId);
        await prisma.devis.update({
          where: { id: d.id },
          data: { numero, dateEmission: d.dateEmission ?? new Date() },
        });
        d.numero = numero;
      }
    }

    // Agrégation des totaux (TVA par devis sur HT net puis sommée — fix #80).
    const totals = computeFactureTotalsFromMultipleDevis(
      devisList.map((d) => ({
        totalHt: d.totalHt,
        remise: d.remise,
        coproduction: d.coproduction,
        sousTotal: d.sousTotal,
        csComedien: d.csComedien,
        csTechniciens: d.csTechniciens,
        fraisGeneraux: d.fraisGeneraux,
        marge: d.marge,
        tauxTva: d.tauxTva ?? 20,
      }))
    );

    // Taux CS/FG/marge : les devis peuvent différer. Ces taux snapshot sont
    // purement indicatifs sur la facture (les montants, eux, sont sommés). On
    // stocke ceux du 1er devis (cohérent avec le mono qui snapshot le devis
    // source) — la décomposition affichée reste la SOMME des montants.
    const ref = devisList[0];
    const company = user.company;

    // #98 : brouillon sans numéro. Multi-devis → devisId (miroir mono) reste
    // NULL, l'ensemble des sources vit dans FactureDevis.
    const facture = await prisma.facture.create({
      data: {
        companyId: user.companyId,
        clientId: validation.clientId,
        devisId: null,
        devisLinks: { create: ids.map((devisId) => ({ devisId })) },
        numero: null,
        type: "SOLDE",
        totalHt: totals.totalHt,
        tauxTva: totals.tauxTva,
        // Mention TVA custom : pertinente seulement si taux=0. Les devis ayant
        // le même taux (garde-fou), on prend celle du 1er.
        tvaMention: ref.tvaMention,
        tva: totals.tva,
        totalTtc: totals.totalTtc,
        sousTotal: totals.sousTotal,
        csComedien: totals.csComedien,
        csTechniciens: totals.csTechniciens,
        baseMarge: totals.baseMarge,
        fraisGeneraux: totals.fraisGeneraux,
        marge: totals.marge,
        remise: totals.remise,
        coproduction: totals.coproduction,
        tauxCsComedien: ref.tauxCsComedien,
        tauxCsTech: ref.tauxCsTech,
        tauxFg: ref.tauxFg,
        tauxMarge: ref.tauxMarge,
        dateEcheance: input.dateEcheance ? new Date(input.dateEcheance) : null,
        // Snapshot mentions légales L441-9
        siretEmetteur: company.siret,
        tvaIntraEmetteur: company.tvaIntra,
        ibanEmetteur: company.iban,
        bicEmetteur: company.bic,
        nomBanqueEmetteur: company.nomBanque,
        conditionsPaiement: company.conditionsPaiement,
        nomEmetteur: company.name,
        adresseEmetteur: [company.address, company.postalCode, company.city]
          .filter(Boolean)
          .join(", "),
        createdById: user.id,
      },
      include: { client: true, devisLinks: { include: { devis: true } } },
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_CREEE",
      entityType: "Facture",
      entityId: facture.id,
      details: {
        type: "SOLDE",
        recap: true,
        totalHt: totals.totalHt,
        devisNumeros: devisList.map((d) => d.numero),
      },
      factureId: facture.id,
    });

    return Response.json({ data: facture }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "Données invalides", details: err.issues },
        { status: 400 }
      );
    }
    return handleAuthError(err);
  }
}
export const dynamic = "force-dynamic";
