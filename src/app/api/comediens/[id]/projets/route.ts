import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:read");
    const { id } = await params;

    // Vérifier que ce comédien appartient à la société
    const comedien = await prisma.comedien.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, prenom: true, nom: true, agent: { select: { id: true, nom: true, prenom: true, agence: true } } },
    });

    if (!comedien) {
      return Response.json({ error: "Comédien introuvable" }, { status: 404 });
    }

    // Toutes les lignes devis où ce comédien apparaît
    const lignes = await prisma.devisLigne.findMany({
      where: { comedienId: id },
      select: {
        id: true,
        libelle: true,
        tag: true,
        quantite: true,
        prixUnit: true,
        section: {
          select: {
            devis: {
              select: {
                id: true,
                numero: true,
                nomProjet: true,
                objet: true,
                statut: true,
                dateSeance: true,
                client: { select: { id: true, name: true } },
                companyId: true,
              },
            },
          },
        },
      },
    });

    // Filtrer par companyId (sécurité multi-tenant) et dédoublonner par devis
    const projetsMap = new Map<string, {
      devisId: string;
      numero: string | null;
      nomProjet: string | null;
      objet: string;
      statut: string;
      dateSeance: Date | null;
      client: { id: string; name: string };
      lignes: { id: string; libelle: string; tag: string; montantHt: number }[];
    }>();

    for (const ligne of lignes) {
      const devis = ligne.section.devis;
      if (devis.companyId !== user.companyId) continue;

      const montantHt = ligne.quantite * ligne.prixUnit;

      if (!projetsMap.has(devis.id)) {
        projetsMap.set(devis.id, {
          devisId: devis.id,
          numero: devis.numero,
          nomProjet: devis.nomProjet,
          objet: devis.objet,
          statut: devis.statut,
          dateSeance: devis.dateSeance,
          client: devis.client,
          lignes: [],
        });
      }

      projetsMap.get(devis.id)!.lignes.push({
        id: ligne.id,
        libelle: ligne.libelle,
        tag: ligne.tag,
        montantHt,
      });
    }

    const projets = Array.from(projetsMap.values()).map((p) => ({
      ...p,
      montantTotalHt: p.lignes.reduce((s, l) => s + l.montantHt, 0),
    }));

    return Response.json({ data: { comedien, projets } });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
