import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextFactureNumero, getNextDevisNumero } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { computeFactureTotalsFromDevis } from "@/lib/invoice-totals";
import { isDevisFacturable } from "@/lib/devis-facturable";
import { z } from "zod";

const CreateFactureSchema = z.object({
  devisId: z.string().min(1),
  type: z.enum(["ACOMPTE", "SOLDE", "AVOIR"]),
  pourcentage: z.number().min(0).max(100).optional().default(50), // Pour acompte
  dateEcheance: z.string().optional(), // "YYYY-MM-DD" depuis <input type="date">
});

export async function GET() {
  try {
    const user = await requireAuth("facture:read");

    const factures = await prisma.facture.findMany({
      where: { companyId: user.companyId },
      include: {
        client: { select: { id: true, name: true } },
        paiements: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ data: factures });
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth("facture:create");
    const body = await req.json();
    const input = CreateFactureSchema.parse(body);

    // Récupérer le devis source
    const devis = await prisma.devis.findFirst({
      where: { id: input.devisId, companyId: user.companyId },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    // #97 : on peut facturer dès que le devis est VALIDÉ en interne (Vanda),
    // sans attendre le circuit ENVOYE → ACCEPTE.
    if (!isDevisFacturable(devis.statut)) {
      return Response.json(
        { error: "Le devis doit être validé ou accepté pour générer une facture" },
        { status: 400 }
      );
    }

    // Un devis VALIDE peut ne pas encore avoir de numéro (attribué au 1er PDF
    // ou à l'envoi). On le matérialise ici si besoin — même logique que la
    // génération PDF : le numéro séquentiel est réservé définitivement.
    let devisNumero = devis.numero;
    if (!devisNumero) {
      devisNumero = await getNextDevisNumero(user.companyId);
      await prisma.devis.update({
        where: { id: devis.id },
        data: { numero: devisNumero, dateEmission: devis.dateEmission ?? new Date() },
      });
    }

    // Pré-récupération du HT brut déjà facturé en acomptes (utilisé pour
    // le calcul SOLDE par le helper).
    const acomptesAggregate =
      input.type === "SOLDE"
        ? await prisma.facture.aggregate({
            where: { devisId: devis.id, type: "ACOMPTE" },
            _sum: { totalHt: true },
          })
        : null;

    // ⚠️ BUG #80 (NONNA) : avant ce helper, la TVA était calculée sur
    // devis.totalHt (HT BRUT avant remise) — surfacturant la TVA sur les
    // devis remisés. Le helper computeFactureTotalsFromDevis() reproduit
    // fidèlement la sémantique de calculerDevis() : TVA sur HT post-remise.
    // Voir src/lib/invoice-totals.ts.
    const totals = computeFactureTotalsFromDevis({
      devis,
      type: input.type,
      pourcentageAcompte: input.pourcentage,
      acomptesTotalHt: acomptesAggregate?._sum.totalHt ?? 0,
    });

    const totalHt        = totals.totalHt;
    const tauxTva        = devis.tauxTva ?? 20;
    const tva            = totals.tva;
    const totalTtc       = totals.totalTtc;
    const sousTotal      = totals.sousTotal;
    const csComedien     = totals.csComedien;
    const csTechniciens  = totals.csTechniciens;
    const fraisGeneraux  = totals.fraisGeneraux;
    const margeSnap      = totals.marge;
    const remiseSnap     = totals.remise;
    const coproductionSnap = totals.coproduction;
    const baseMarge      = totals.baseMarge;
    // TODO immuabilité légale : aujourd'hui la facture lit les lignes
    // depuis le devis source. Une modif post-émission du devis altère
    // la facture, ce qui viole l'art. 289 CGI. À traiter avant prod :
    // soit dupliquer les lignes en FactureSection/FactureLigne au moment
    // de l'émission, soit verrouiller le devis dès qu'il a une facture.

    // Récupérer les infos société pour les mentions légales
    const company = user.company;
    const numero = await getNextFactureNumero(user.companyId, input.type, devisNumero);

    const facture = await prisma.facture.create({
      data: {
        companyId: user.companyId,
        clientId: devis.clientId,
        devisId: devis.id,
        numero,
        type: input.type,
        totalHt,
        tauxTva,
        // Snapshot de la mention TVA du devis source — utile uniquement
        // si tauxTva=0 (sinon null en DB sur le devis = null ici)
        tvaMention: devis.tvaMention,
        // Snapshot période d'exploitation (ticket #69). Re-snapshot à
        // chaque facture acompte/solde — si le devis est modifié entre
        // deux émissions, la 2e facture reflète l'état au moment de
        // son émission. Immuable ensuite via le verrouillage EMISE.
        periodeExploitationDebut: devis.periodeExploitationDebut,
        periodeExploitationFin: devis.periodeExploitationFin,
        periodeExploitationLibelle: devis.periodeExploitationLibelle,
        tva,
        totalTtc,
        // Breakdown au prorata
        sousTotal,
        csComedien,
        csTechniciens,
        baseMarge,
        fraisGeneraux,
        marge: margeSnap,
        remise: remiseSnap,
        coproduction: coproductionSnap,
        tauxCsComedien: devis.tauxCsComedien,
        tauxCsTech:     devis.tauxCsTech,
        tauxFg:         devis.tauxFg,
        tauxMarge:      devis.tauxMarge,
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
      include: { client: true, devis: true },
    });

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_CREEE",
      entityType: "Facture",
      entityId: facture.id,
      details: { numero, type: input.type, totalHt },
      factureId: facture.id,
    });

    return Response.json({ data: facture }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
