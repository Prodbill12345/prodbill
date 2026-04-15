import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ComediensClient } from "@/components/comediens/ComediensClient";

export const dynamic = "force-dynamic";

export default async function ComediensPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const [comediens, agents] = await Promise.all([
    prisma.comedien.findMany({
      where: { companyId: user.companyId },
      include: {
        agent: { select: { id: true, nom: true, prenom: true, agence: true } },
        lignes: {
          select: {
            quantite: true,
            prixUnit: true,
            section: { select: { devisId: true } },
          },
        },
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    prisma.agent.findMany({
      where: { companyId: user.companyId },
      select: { id: true, nom: true, prenom: true, agence: true },
      orderBy: [{ agence: "asc" }, { nom: "asc" }],
    }),
  ]);

  // Calcul stats côté serveur
  const comediensWithStats = comediens.map((c) => {
    const nbDevis = new Set(c.lignes.map((l) => l.section.devisId)).size;
    const montantTotal = c.lignes.reduce((s, l) => s + l.quantite * l.prixUnit, 0);
    const { lignes: _l, ...rest } = c;
    return { ...rest, nbDevis, montantTotal };
  });

  return <ComediensClient comediens={comediensWithStats} agents={agents} />;
}
