import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, AlertTriangle } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import {
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
  FACTURE_TYPE_LABELS,
} from "@/types";
import { FactureActions } from "@/components/factures/FactureActions";
import { FactureBdcField } from "@/components/factures/FactureBdcField";

const RELANCE_LABELS: Record<string, string> = {
  ENVOI: "Envoi facture",
  RELANCE_1: "1ère relance",
  RELANCE_2: "2ème relance",
  MISE_EN_DEMEURE: "Mise en demeure",
};

const RELANCE_COLORS: Record<string, string> = {
  ENVOI: "bg-blue-100 text-blue-700",
  RELANCE_1: "bg-yellow-100 text-yellow-700",
  RELANCE_2: "bg-orange-100 text-orange-700",
  MISE_EN_DEMEURE: "bg-red-100 text-red-700",
};

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const facture = await prisma.facture.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      client: true,
      devis: { select: { id: true, numero: true, objet: true } },
      paiements: { orderBy: { date: "desc" } },
      relances: { orderBy: { sentAt: "desc" } },
    },
  });

  if (!facture) notFound();

  const totalPaye = facture.paiements.reduce((s, p) => s + p.montant, 0);
  const resteAPayer = facture.totalTtc - totalPaye;
  const isAvoir = facture.type === "AVOIR";
  const isRetard =
    facture.statut === "EN_RETARD" ||
    (["EMISE", "PAYEE_PARTIEL"].includes(facture.statut) &&
      facture.dateEcheance != null &&
      new Date(facture.dateEcheance) < new Date());

  const relancesHorsEnvoi = facture.relances.filter((r) => r.type !== "ENVOI");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/factures"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Factures
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">
                {facture.numero}
              </h1>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${FACTURE_STATUT_COLORS[facture.statut]}`}
              >
                {FACTURE_STATUT_LABELS[facture.statut]}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                {FACTURE_TYPE_LABELS[facture.type]}
              </span>
              {isRetard && (
                <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" />
                  En retard
                </span>
              )}
            </div>
            {facture.devis && (
              <p className="text-slate-500 mt-1">
                Réf. devis :{" "}
                <Link
                  href={`/devis/${facture.devis.id}`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  {facture.devis.numero}
                </Link>{" "}
                — {facture.devis.objet}
              </p>
            )}
          </div>
          <FactureActions
            facture={facture}
            hasRelances={relancesHorsEnvoi.length > 0}
          />
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
                <p className="font-medium text-slate-900">
                  {facture.client.name}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {facture.client.email}
                </p>
                {facture.client.siret && (
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    SIRET {facture.client.siret}
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-slate-500">
                {facture.dateEmission && (
                  <p>Émise le {formatDate(facture.dateEmission)}</p>
                )}
                {facture.dateEcheance && (
                  <p className={isRetard ? "text-red-600 font-medium" : ""}>
                    Échéance : {formatDate(facture.dateEcheance)}
                    {isRetard && " ⚠"}
                  </p>
                )}
              </div>
            </div>
            <FactureBdcField
              factureId={facture.id}
              initialValue={facture.numeroBdc}
              isLocked={!!facture.emiseAt}
            />
          </div>

          {/* Détail */}
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
              <h4 className="font-semibold text-slate-800">Détail</h4>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">
                    Description
                  </th>
                  <th className="text-right px-5 py-2.5 text-xs text-slate-400 font-medium">
                    Montant HT
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-50">
                  <td className="px-5 py-4 text-sm text-slate-700">
                    {facture.type === "ACOMPTE" && facture.devis
                      ? `Acompte sur devis n° ${facture.devis.numero} — ${facture.devis.objet}`
                      : facture.type === "SOLDE" && facture.devis
                        ? `Solde sur devis n° ${facture.devis.numero} — ${facture.devis.objet}`
                        : isAvoir && facture.devis
                          ? `Avoir sur devis n° ${facture.devis.numero}`
                          : FACTURE_TYPE_LABELS[facture.type]}
                  </td>
                  <td className="px-5 py-4 text-sm text-right tabular-nums font-medium text-slate-900">
                    {isAvoir
                      ? `- ${formatEuros(Math.abs(facture.totalHt))}`
                      : formatEuros(facture.totalHt)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Paiements */}
          {facture.paiements.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
                <h4 className="font-semibold text-slate-800">Paiements reçus</h4>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">Date</th>
                    <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">Référence</th>
                    <th className="text-left px-5 py-2.5 text-xs text-slate-400 font-medium">Mode</th>
                    <th className="text-right px-5 py-2.5 text-xs text-slate-400 font-medium">Montant TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {facture.paiements.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-sm text-slate-600">{formatDate(p.date)}</td>
                      <td className="px-5 py-3 text-sm text-slate-500 font-mono">{p.reference ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500 capitalize">{p.mode ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums font-medium text-green-700">
                        {formatEuros(p.montant)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Historique des relances */}
          {facture.relances.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-50 bg-slate-50/50">
                <Mail className="w-4 h-4 text-slate-400" />
                <h4 className="font-semibold text-slate-800">
                  Historique des emails ({facture.relances.length})
                </h4>
              </div>
              <div className="divide-y divide-slate-50">
                {facture.relances.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                    <span
                      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                        RELANCE_COLORS[r.type] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {RELANCE_LABELS[r.type] ?? r.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 truncate">{r.subject}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Envoyé à <span className="font-medium">{r.sentTo}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatDate(r.sentAt)}
                    </span>
                  </div>
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
              <div className="flex justify-between">
                <span className="text-slate-500">
                  {isAvoir ? "Avoir HT" : "Total HT"}
                </span>
                <span className="tabular-nums text-slate-700">
                  {isAvoir
                    ? `- ${formatEuros(Math.abs(facture.totalHt))}`
                    : formatEuros(facture.totalHt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">TVA 20%</span>
                <span className="tabular-nums text-slate-700">
                  {isAvoir
                    ? `- ${formatEuros(Math.abs(facture.tva))}`
                    : formatEuros(facture.tva)}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-2 mt-2">
                <div className="flex justify-between font-bold text-base">
                  <span>{isAvoir ? "Montant avoir TTC" : "Total TTC"}</span>
                  <span className={isAvoir ? "text-red-600" : "text-blue-600"}>
                    {isAvoir
                      ? `- ${formatEuros(Math.abs(facture.totalTtc))}`
                      : formatEuros(facture.totalTtc)}
                  </span>
                </div>
              </div>

              {!isAvoir && totalPaye > 0 && (
                <div className="border-t border-slate-100 pt-2 mt-1 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Déjà réglé</span>
                    <span className="tabular-nums text-green-700 font-medium">
                      {formatEuros(totalPaye)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Reste à payer</span>
                    <span className="tabular-nums text-slate-900">
                      {formatEuros(resteAPayer)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coordonnées bancaires */}
          <div className="bg-white rounded-xl border border-slate-100 p-5 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-600 mb-2">Coordonnées bancaires</p>
            <p><span className="font-medium text-slate-700">IBAN</span> {facture.ibanEmetteur || "—"}</p>
            <p><span className="font-medium text-slate-700">BIC</span> {facture.bicEmetteur || "—"}</p>
            <p className="pt-1"><span className="font-medium text-slate-700">SIRET</span> {facture.siretEmetteur || "—"}</p>
            <p><span className="font-medium text-slate-700">N° TVA</span> {facture.tvaIntraEmetteur || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
