import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { DevisBuilder } from "@/components/devis/DevisBuilder";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";

export default async function NouveauDevisPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { company: true },
  });

  if (!user) redirect("/sign-in");

  const clients = await prisma.client.findMany({
    where: { companyId: user.companyId },
    orderBy: { name: "asc" },
  });

  const defaultTaux = {
    tauxCsComedien: user.company.defaultTauxCsComedien,
    tauxCsTech: user.company.defaultTauxCsTech,
    tauxFg: user.company.defaultTauxFg,
    tauxMarge: user.company.defaultTauxMarge,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/devis"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Devis
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Nouveau devis</h1>
      </div>

      {clients.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-amber-800 font-medium">
            Aucun client trouvé.{" "}
            <Link href="/clients/nouveau" className="underline hover:no-underline">
              Créez d&apos;abord un client
            </Link>{" "}
            pour pouvoir établir un devis.
          </p>
        </div>
      ) : (
        <DevisBuilder clients={clients} defaultTaux={defaultTaux} />
      )}
    </div>
  );
}
