import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { DevisListClient } from "@/components/devis/DevisListClient";

export default async function DevisPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return null;

  const devis = await prisma.devis.findMany({
    where: { companyId: user.companyId },
    include: { client: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      {/* Header sticky */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Devis</h1>
          <p className="text-slate-500 mt-0.5 text-sm">{devis.length} devis au total</p>
        </div>
        <Link
          href="/devis/nouveau"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-900/20 hover:shadow-blue-900/30 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau devis
        </Link>
      </div>

      {devis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-indigo-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Aucun devis
          </h3>
          <p className="text-slate-400 mb-6 text-sm">
            Créez votre premier devis pour commencer
          </p>
          <Link
            href="/devis/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-md transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nouveau devis
          </Link>
        </div>
      ) : (
        <DevisListClient devis={devis} />
      )}
    </div>
  );
}
