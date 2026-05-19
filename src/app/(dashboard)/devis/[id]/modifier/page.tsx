import { prisma } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { isHistoricalImport } from "@/lib/historical-import";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DevisBuilder } from "@/components/devis/DevisBuilder";

export default async function ModifierDevisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
  });
  if (!company) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const devis = await db.devis.findFirst({
    where: { id },
    include: {
      sections: {
        include: { lignes: { orderBy: { ordre: "asc" } } },
        orderBy: { ordre: "asc" },
      },
    },
  });

  if (!devis) notFound();

  const [clients, agents, comediens] = await Promise.all([
    db.client.findMany({
      orderBy: { name: "asc" },
    }),
    db.agent.findMany({
      select: { id: true, nom: true, prenom: true, agence: true },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    }),
    db.comedien.findMany({
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
  ]);

  const defaultTaux = {
    tauxCsComedien: company.defaultTauxCsComedien,
    tauxCsTech: company.defaultTauxCsTech,
    tauxFg: company.defaultTauxFg,
    tauxMarge: company.defaultTauxMarge,
  };

  const initialData = {
    clientId: devis.clientId,
    objet: devis.objet,
    description: devis.description,
    annee: devis.annee,
    tauxCsComedien: devis.tauxCsComedien,
    tauxCsTech: devis.tauxCsTech,
    tauxFg: devis.tauxFg,
    tauxMarge: devis.tauxMarge,
    tauxTva: devis.tauxTva,
    tvaMention: devis.tvaMention,
    dateEmission: devis.dateEmission
      ? devis.dateEmission.toISOString().slice(0, 10)
      : null,
    dateValidite: devis.dateValidite
      ? devis.dateValidite.toISOString().slice(0, 10)
      : null,
    dateSeance: devis.dateSeance
      ? devis.dateSeance.toISOString().slice(0, 10)
      : null,
    periodeExploitationDebut: devis.periodeExploitationDebut
      ? devis.periodeExploitationDebut.toISOString().slice(0, 10)
      : null,
    periodeExploitationFin: devis.periodeExploitationFin
      ? devis.periodeExploitationFin.toISOString().slice(0, 10)
      : null,
    periodeExploitationLibelle: devis.periodeExploitationLibelle,
    notes: devis.notes,
    remise: devis.remise ?? 0,
    bdcClientUrl: devis.bdcClientUrl,
    bdcClientFilename: devis.bdcClientFilename,
    bdcClientUploadedAt: devis.bdcClientUploadedAt
      ? devis.bdcClientUploadedAt.toISOString()
      : null,
    sections: devis.sections.map((s) => ({
      titre: s.titre,
      lignes: s.lignes.map((l) => ({
        libelle: l.libelle,
        tag: l.tag as "ARTISTE" | "TECHNICIEN_HCS" | "STUDIO" | "MUSIQUE" | "AGENT",
        quantite: l.quantite,
        prixUnit: l.prixUnit,
        comedienId: l.comedienId,
        agentId: l.agentId,
        tauxIndexation: l.tauxIndexation ?? 0,
        horsMarge: l.horsMarge,
      })),
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/devis/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          {devis.numero ?? "Brouillon"}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          Modifier le devis{devis.numero ? ` ${devis.numero}` : ""}
        </h1>
      </div>

      <DevisBuilder
        clients={clients}
        agents={agents}
        comediens={comediens}
        defaultTaux={defaultTaux}
        devisId={id}
        initialData={initialData}
        historicalImportWarning={isHistoricalImport(
          { createdAt: devis.createdAt, updatedAt: devis.updatedAt },
          { name: company.name }
        )}
      />
    </div>
  );
}
