import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextFactureNumero } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
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

    if (devis.statut !== "ACCEPTE") {
      return Response.json(
        { error: "Le devis doit être accepté pour générer une facture" },
        { status: 400 }
      );
    }

    if (!devis.numero) {
      return Response.json({ error: "Numéro de devis manquant" }, { status: 400 });
    }

    // Calculer le montant selon le type
    let totalHt: number;
    if (input.type === "ACOMPTE") {
      totalHt = Math.round(devis.totalHt * (input.pourcentage / 100) * 100) / 100;
    } else if (input.type === "AVOIR") {
      totalHt = -devis.totalHt;
    } else {
      // Solde = total - acomptes déjà facturés
      const acomptesTotal = await prisma.facture.aggregate({
        where: { devisId: devis.id, type: "ACOMPTE" },
        _sum: { totalHt: true },
      });
      totalHt = Math.round((devis.totalHt - (acomptesTotal._sum.totalHt ?? 0)) * 100) / 100;
    }

    const tva = Math.round(totalHt * 0.2 * 100) / 100;
    const totalTtc = Math.round((totalHt + tva) * 100) / 100;

    // Snapshot du breakdown du devis lié, ramené au prorata du montant facturé.
    // Ratio sur totalHt (plus stable que TTC à cause des arrondis TVA).
    // TODO immuabilité légale : aujourd'hui la facture lit les lignes
    // depuis le devis source. Une modif post-émission du devis altère
    // la facture, ce qui viole l'art. 289 CGI. À traiter avant prod :
    // soit dupliquer les lignes en FactureSection/FactureLigne au moment
    // de l'émission, soit verrouiller le devis dès qu'il a une facture.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const ratio = devis.totalHt > 0 ? totalHt / devis.totalHt : 0;
    const sousTotal      = r2(devis.sousTotal     * ratio);
    const csComedien     = r2(devis.csComedien    * ratio);
    const csTechniciens  = r2(devis.csTechniciens * ratio);
    const fraisGeneraux  = r2(devis.fraisGeneraux * ratio);
    const margeSnap      = r2(devis.marge         * ratio);
    const baseMarge      = r2(sousTotal + csTechniciens);

    // Récupérer les infos société pour les mentions légales
    const company = user.company;
    const numero = await getNextFactureNumero(user.companyId, input.type, devis.numero);

    const facture = await prisma.facture.create({
      data: {
        companyId: user.companyId,
        clientId: devis.clientId,
        devisId: devis.id,
        numero,
        type: input.type,
        totalHt,
        tva,
        totalTtc,
        // Breakdown au prorata
        sousTotal,
        csComedien,
        csTechniciens,
        baseMarge,
        fraisGeneraux,
        marge: margeSnap,
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
