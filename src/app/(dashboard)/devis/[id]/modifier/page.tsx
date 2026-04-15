import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
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
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { company: true },
  });
  if (!user) redirect("/sign-in");

  const devis = await prisma.devis.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      sections: {
        include: { lignes: { orderBy: { ordre: "asc" } } },
        orderBy: { ordre: "asc" },
      },
    },
  });

  if (!devis) notFound();

  // Seuls BROUILLON et ENVOYE sont modifiables
  if (devis.statut !== "BROUILLON" && devis.statut !== "ENVOYE") {
    redirect(`/devis/${id}`);
  }

  const [clients, agents, comediens] = await Promise.all([
    prisma.client.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: "asc" },
    }),
    prisma.agent.findMany({
      where: { companyId: user.companyId },
      select: { id: true, nom: true, prenom: true, agence: true },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    }),
    prisma.comedien.findMany({
      where: { companyId: user.companyId },
      select: { id: true, prenom: true, nom: true },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
  ]);

  const defaultTaux = {
    tauxCsComedien: user.company.defaultTauxCsComedien,
    tauxCsTech: user.company.defaultTauxCsTech,
    tauxFg: user.company.defaultTauxFg,
    tauxMarge: user.company.defaultTauxMarge,
  };

  const initialData = {
    clientId: devis.clientId,
    objet: devis.objet,
    description: devis.description,
    tauxCsComedien: devis.tauxCsComedien,
    tauxCsTech: devis.tauxCsTech,
    tauxFg: devis.tauxFg,
    tauxMarge: devis.tauxMarge,
    dateValidite: devis.dateValidite
      ? devis.dateValidite.toISOString().slice(0, 10)
      : null,
    notes: devis.notes,
    remise: devis.remise ?? 0,
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
      />
    </div>
  );
}
