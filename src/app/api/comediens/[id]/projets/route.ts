import { requireAuth, handleAuthError } from "@/lib/auth";
import { scopedPrisma } from "@/lib/scoped-prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:read");
    const { id } = await params;
    const db = scopedPrisma(user.companyId);

    // Vérifier que ce comédien appartient à la société. scoped-prisma
    // injecte automatiquement companyId — si le comédien est d'un autre
    // tenant, retourne null → 404.
    const comedien = await db.comedien.findFirst({
      where: { id },
      select: { id: true, prenom: true, nom: true, agent: { select: { id: true, nom: true, prenom: true, agence: true } } },
    });

    if (!comedien) {
      return Response.json({ error: "Comédien introuvable" }, { status: 404 });
    }

    // Toutes les lignes du comédien — filtre direct via DevisLigne.companyId
    // (scoped-prisma) + sécurité ceinture-bretelles : si jamais le helper
    // est retiré, le filtre comedienId garde le scope par la FK Comedien
    // (qui est elle-même tenant-scoped).
    const lignes = await db.devisLigne.findMany({
      where: { comedienId: id },
      select: {
        id: true,
        libelle: true,
        tag: true,
        quantite: true,
        prixUnit: true,
        paiementComedien: true,
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
              },
            },
          },
        },
      },
    });

    // Dédoublonner par devis (un comédien peut apparaître sur plusieurs lignes
    // d'un même devis — multi-cachets).
    const projetsMap = new Map<string, {
      devisId: string;
      numero: string | null;
      nomProjet: string | null;
      objet: string;
      statut: string;
      dateSeance: Date | null;
      client: { id: string; name: string };
      lignes: { id: string; libelle: string; tag: string; montantHt: number; paiementComedien: boolean }[];
    }>();

    for (const ligne of lignes) {
      const devis = ligne.section.devis;
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
        paiementComedien: ligne.paiementComedien,
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
