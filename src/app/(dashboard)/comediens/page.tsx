import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { ComediensClient } from "@/components/comediens/ComediensClient";

export const dynamic = "force-dynamic";

export default async function ComediensPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const [comediens, agents] = await Promise.all([
    db.comedien.findMany({
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
    db.agent.findMany({
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
