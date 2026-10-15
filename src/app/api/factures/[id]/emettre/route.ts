import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getNextFactureNumero } from "@/lib/numbering";
import { sendFactureEmail } from "@/lib/email/resend";
import { loadFactureTotals } from "@/lib/facture-recompute";
import { isRecapFacture } from "@/lib/facture-recap-view";
import { validateFactureEmittable } from "@/lib/facture-recap";
import {
  getFacturationState,
  toFactureForFacturation,
  FACTURE_FACTURATION_SELECT,
  type FactureForFacturation,
} from "@/lib/devis-facturation-state";

/**
 * POST /api/factures/[id]/emettre
 * Rend la facture IMMUABLE (statut EMISE).
 * Après cette action, aucune modification n'est autorisée (contrainte légale).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:emit");
    const { id } = await params;

    const facture = await prisma.facture.findFirst({
      where: { id, companyId: user.companyId },
      include: { client: true },
    });

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    if (facture.statut !== "BROUILLON") {
      return Response.json(
        { error: "Seul un brouillon peut être émis" },
        { status: 400 }
      );
    }

    // #99 (BUG-RECAP-BROUILLON-STALE) : recalculer les totaux à jour depuis les
    // devis liés (le brouillon a pu se désynchroniser) puis REVALIDER
    // l'éligibilité avant de figer — un devis lié a pu changer d'état/TVA ou
    // être émis ailleurs entre la création et l'émission.
    const { devisRows, totals } = await loadFactureTotals(prisma, id);
    const isRecap = isRecapFacture(facture.devisId, devisRows.length);

    if (devisRows.length > 0) {
      const devisIds = devisRows.map((d) => d.id);
      // GUARD-DEVIS-DOUBLE-FACTURATION : « déjà émis ailleurs » ne veut pas dire
      // « a une autre facture émise », mais « a une autre facture émise QUI
      // OCCUPE LA MÊME PLACE ». Un ACOMPTE émis ne doit pas empêcher d'émettre
      // le SOLDE : c'est le flux légitime (bug avant ce ticket — l'émission du
      // solde était refusée dès qu'un acompte était émis). On délègue au même
      // prédicat que la création, qui ignore aussi les AVOIR et les ANNULEE.
      const emittedLinks = await prisma.factureDevis.findMany({
        where: {
          devisId: { in: devisIds },
          facture: { emiseAt: { not: null }, id: { not: id } },
        },
        select: { devisId: true, facture: { select: FACTURE_FACTURATION_SELECT } },
      });
      const emittedByDevis = new Map<string, FactureForFacturation[]>();
      for (const l of emittedLinks) {
        const list = emittedByDevis.get(l.devisId) ?? [];
        list.push(toFactureForFacturation(l.facture));
        emittedByDevis.set(l.devisId, list);
      }
      const emittedElsewhere = new Set(
        devisIds.filter((devisId) => {
          const state = getFacturationState(emittedByDevis.get(devisId) ?? []);
          if (facture.type === "ACOMPTE") return !state.canCreateAcompte;
          if (facture.type === "SOLDE") return !state.canCreateSolde;
          return false; // AVOIR : hors périmètre du garde-fou
        })
      );
      const check = validateFactureEmittable({
        isRecap,
        devis: devisRows.map((d) => ({
          numero: d.numero,
          statut: d.statut,
          clientId: d.clientId,
          tauxTva: d.tauxTva ?? 20,
          emittedElsewhere: emittedElsewhere.has(d.id),
        })),
      });
      if (!check.ok) {
        return Response.json({ error: check.error }, { status: 400 });
      }
    }

    const now = new Date();
    const dateEcheance =
      facture.dateEcheance ??
      new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000); // +45 jours

    // #98 : le numéro définitif est attribué ICI (à l'émission), tiré du
    // Counter FACTURE de façon atomique, puis posé EN MÊME TEMPS que emiseAt
    // (évite le legacy emiseAt=null, cf. fix 3bfcbc0).
    const numero = await getNextFactureNumero(user.companyId);

    // Flip BROUILLON→EMISE conditionnel : garde-fou double-clic. Seule la
    // 1ère requête (statut encore BROUILLON) gagne. La contrainte unique
    // (companyId, numero) est le backstop ultime contre tout doublon.
    const flip = await prisma.facture.updateMany({
      where: { id, companyId: user.companyId, statut: "BROUILLON" },
      data: {
        statut: "EMISE",
        numero,
        dateEmission: now,
        dateEcheance,
        emiseAt: now, // Marque l'immuabilité
        // #99 : fige les totaux recalculés à l'instant (no-op si déjà à jour ;
        // omis pour une facture sans devis lié → on garde ses totaux stockés).
        ...(totals ?? {}),
      },
    });

    if (flip.count === 0) {
      // Une autre requête a émis entre-temps. Le numéro tiré ci-dessus n'est
      // pas réutilisé (trou toléré) — aucune double émission.
      return Response.json(
        { error: "Cette facture a déjà été émise" },
        { status: 409 }
      );
    }

    const updated = await prisma.facture.findFirstOrThrow({ where: { id } });

    // Envoyer par email si PDF disponible. L'émission (immuabilité légale) est
    // déjà committée ci-dessus : un échec/skip d'envoi ne doit JAMAIS la
    // remettre en cause. sendFactureEmail passe par sendEmailSafe → si
    // MAIL_KILL_SWITCH est actif, aucun mail ne part (skipped, pas d'erreur).
    if (facture.pdfUrl && facture.client.email) {
      try {
        await sendFactureEmail({
          to: facture.client.email,
          clientName: facture.client.name,
          companyName: facture.nomEmetteur,
          factureNumero: numero,
          totalTtc: updated.totalTtc,
          dateEcheance,
          pdfUrl: facture.pdfUrl,
          iban: facture.ibanEmetteur,
          bic: facture.bicEmetteur,
        });
      } catch (mailErr) {
        console.error(
          `[emettre facture ${id}] envoi mail échoué (facture émise quand même) :`,
          mailErr
        );
      }
    }

    await logAudit({
      companyId: user.companyId,
      userId: user.id,
      userName: user.name,
      action: "FACTURE_EMISE",
      entityType: "Facture",
      entityId: id,
      details: {
        numero,
        totalTtc: updated.totalTtc,
        dateEcheance: dateEcheance.toISOString(),
      },
      factureId: id,
    });

    return Response.json({ data: updated });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
