import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileDown, Send, CheckCircle, Receipt } from "lucide-react";
import { formatEuros, formatPct } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_COLORS, DEVIS_STATUT_LABELS, LIGNE_TAG_LABELS, LIGNE_TAG_COLORS } from "@/types";
import { DevisActions } from "@/components/devis/DevisActions";

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const devis = await prisma.devis.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      client: true,
      sections: {
        include: { lignes: { orderBy: { ordre: "asc" } } },
        orderBy: { ordre: "asc" },
      },
      bdc: true,
      factures: { include: { paiements: true } },
    },
  });

  if (!devis) notFound();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/devis"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Devis
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {devis.numero ?? "Brouillon"}
              </h1>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${DEVIS_STATUT_COLORS[devis.statut]}`}
              >
                {DEVIS_STATUT_LABELS[devis.statut]}
              </span>
            </div>
            <p className="text-slate-500 mt-1">{devis.objet}</p>
          </div>
          <DevisActions devis={devis} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Contenu principal */}
        <div className="col-span-2 space-y-5">
          {/* Infos client */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Client</h3>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-slate-900">{devis.client.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{devis.client.email}</p>
                {devis.client.siret && (
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    SIRET {devis.client.siret}
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>Créé le {formatDate(devis.createdAt)}</p>
                {devis.dateValidite && (
                  <p>Valide jusqu&apos;au {formatDate(devis.dateValidite)}</p>
                )}
                {devis.bdc && (
                  <p className="text-blue-600 font-medium mt-1">
                    BDC : {devis.bdc.numero}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sections et lignes */}
          {devis.sections.map((section) => (
            <div key={section.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
                <h4 className="font-semibold text-slate-800">{section.titre}</h4>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">
                      Libellé
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">
                      Tag
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-slate-400 font-medium">
                      Qté
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-slate-400 font-medium">
                      P.U. HT
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-slate-400 font-medium">
                      Total HT
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {section.lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td className="px-5 py-3 text-sm text-slate-700">
                        {ligne.libelle}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${LIGNE_TAG_COLORS[ligne.tag]}`}
                        >
                          {LIGNE_TAG_LABELS[ligne.tag]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-600">
                        {ligne.quantite}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-600">
                        {formatEuros(ligne.prixUnit)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums font-medium text-slate-900">
                        {formatEuros(ligne.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Factures liées */}
          {devis.factures.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-3">Factures générées</h3>
              <div className="space-y-2">
                {devis.factures.map((f) => (
                  <Link
                    key={f.id}
                    href={`/factures/${f.id}`}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {f.numero}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatEuros(f.totalTtc)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panneau totaux */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Récapitulatif</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Sous-total HT", devis.sousTotal],
                [`CS Comédiens (${formatPct(devis.tauxCsComedien)})`, devis.csComedien],
                [`CS Techniciens (${formatPct(devis.tauxCsTech)})`, devis.csTechniciens],
                [`FG (${formatPct(devis.tauxFg)})`, devis.fraisGeneraux],
                [`Marge (${formatPct(devis.tauxMarge)})`, devis.marge],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="tabular-nums text-slate-700">
                    {formatEuros(Number(value))}
                  </span>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-2 mt-2 space-y-1.5">
                <div className="flex justify-between font-semibold">
                  <span>TOTAL HT</span>
                  <span>{formatEuros(devis.totalHt)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>TVA 20%</span>
                  <span>{formatEuros(devis.tva)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-2">
                  <span>TOTAL TTC</span>
                  <span className="text-blue-600">{formatEuros(devis.totalTtc)}</span>
                </div>
              </div>
            </div>
          </div>

          {devis.notes && (
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Notes</h4>
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{devis.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
