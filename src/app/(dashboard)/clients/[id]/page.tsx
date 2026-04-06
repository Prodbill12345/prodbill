import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText, Receipt, Mail, Phone, MapPin } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import {
  DEVIS_STATUT_COLORS,
  DEVIS_STATUT_LABELS,
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
} from "@/types";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const client = await prisma.client.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      devis: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      factures: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!client) notFound();

  const caTotal = client.factures
    .filter((f: any) => f.statut === "PAYEE")
    .reduce((sum: number, f: any) => sum + f.totalTtc, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Clients
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <span className="text-blue-600 font-bold">
                {client.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
              {client.siret && (
                <p className="text-sm text-slate-400 font-mono mt-0.5">
                  SIRET {client.siret}
                </p>
              )}
            </div>
          </div>
          <Link
            href={`/devis/nouveau?clientId=${client.id}`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Nouveau devis
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Colonne gauche — infos */}
        <div className="space-y-4">
          {/* Coordonnées */}
          <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-3">
            <h3 className="font-semibold text-slate-900">Coordonnées</h3>
            <div className="space-y-2 text-sm">
              {client.address && (
                <div className="flex items-start gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 mt-0.5 text-slate-300 shrink-0" />
                  <span>
                    {client.address}
                    {(client.postalCode || client.city) && (
                      <><br />{[client.postalCode, client.city].filter(Boolean).join(" ")}</>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-300 shrink-0" />
                <a href={`mailto:${client.email}`} className="hover:text-blue-600">
                  {client.email}
                </a>
              </div>
              {client.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-300 shrink-0" />
                  <span>{client.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Infos fiscales */}
          <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-2">
            <h3 className="font-semibold text-slate-900">Infos fiscales</h3>
            <div className="space-y-1 text-sm">
              {client.siret && (
                <div className="flex justify-between">
                  <span className="text-slate-500">SIRET</span>
                  <span className="font-mono text-slate-700">{client.siret}</span>
                </div>
              )}
              {client.tvaIntra && (
                <div className="flex justify-between">
                  <span className="text-slate-500">TVA intra</span>
                  <span className="font-mono text-slate-700">{client.tvaIntra}</span>
                </div>
              )}
              {!client.siret && !client.tvaIntra && (
                <p className="text-slate-400 text-xs">Aucune info fiscale renseignée</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Statistiques</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Devis</span>
                <span className="font-semibold text-slate-700">{client.devis.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Factures</span>
                <span className="font-semibold text-slate-700">{client.factures.length}</span>
              </div>
              <div className="flex justify-between border-t border-slate-50 pt-2 mt-2">
                <span className="text-slate-500">CA encaissé</span>
                <span className="font-bold text-slate-900">{formatEuros(caTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-white rounded-xl border border-slate-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-2">Notes</h3>
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Colonne droite — devis + factures */}
        <div className="col-span-2 space-y-5">
          {/* Devis */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h3 className="font-semibold text-slate-900">Devis</h3>
              <span className="text-xs text-slate-400">{client.devis.length} au total</span>
            </div>
            {client.devis.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                Aucun devis pour ce client
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Réf.</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Objet</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Date</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400">Total TTC</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {client.devis.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/devis/${d.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          {d.numero ?? "Brouillon"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600 max-w-xs truncate">{d.objet}</td>
                      <td className="px-5 py-3 text-sm text-slate-400">{formatDate(d.createdAt)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right">
                        {formatEuros(d.totalTtc)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DEVIS_STATUT_COLORS[d.statut]}`}>
                          {DEVIS_STATUT_LABELS[d.statut]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Factures */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
              <h3 className="font-semibold text-slate-900">Factures</h3>
              <span className="text-xs text-slate-400">{client.factures.length} au total</span>
            </div>
            {client.factures.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                Aucune facture pour ce client
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">N°</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Échéance</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400">Total TTC</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {client.factures.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/factures/${f.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                          {f.numero}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-400">{formatDate(f.dateEmission)}</td>
                      <td className="px-5 py-3 text-sm text-slate-400">{formatDate(f.dateEcheance)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right">
                        {formatEuros(f.totalTtc)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${FACTURE_STATUT_COLORS[f.statut]}`}>
                          {FACTURE_STATUT_LABELS[f.statut]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
