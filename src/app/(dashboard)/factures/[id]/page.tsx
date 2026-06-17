import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, AlertTriangle, FileText, ExternalLink } from "lucide-react";
import { formatEuros, formatPct } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import {
  FACTURE_STATUT_COLORS,
  FACTURE_STATUT_LABELS,
  FACTURE_TYPE_LABELS,
} from "@/types";
import { FactureActions } from "@/components/factures/FactureActions";
import { FactureBdcField } from "@/components/factures/FactureBdcField";
import { FactureDateReglementField } from "@/components/factures/FactureDateReglementField";
import { FactureDateEmissionField } from "@/components/factures/FactureDateEmissionField";

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
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const facture = await db.facture.findFirst({
    where: { id },
    include: {
      client: true,
      devis: {
        select: {
          id: true,
          numero: true,
          objet: true,
          totalHt: true,
          bdcClientUrl: true,
          bdcClientFilename: true,
          bdcClientUploadedAt: true,
          sections: {
            orderBy: { ordre: "asc" },
            select: {
              id: true,
              titre: true,
              ordre: true,
              lignes: {
                orderBy: { ordre: "asc" },
                select: {
                  id: true,
                  libelle: true,
                  tag: true,
                  quantite: true,
                  prixUnit: true,
                  total: true,
                  tauxIndexation: true,
                },
              },
            },
          },
        },
      },
      paiements: { orderBy: { date: "desc" } },
      relances: { orderBy: { sentAt: "desc" } },
    },
  });

  if (!facture) notFound();

  const totalPaye = facture.paiements.reduce((s, p) => s + p.montant, 0);
  const resteAPayer = facture.totalTtc - totalPaye;
  const isAvoir = facture.type === "AVOIR";
  // TOTAL HT affiche = base TVA = totalHt - remise (parite avec DevisPdf
  // et le fix du commit 335b713 cote Devis). Sur facture sans remise,
  // totalHtNet === totalHt → aucune regression.
  const totalHtNet = facture.totalHt - facture.remise;
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
            {/* BDC client reçu — fichier uploadé sur le devis source.
                Lecture seule ici : la modif passe par /devis/[id]/modifier.
                Ticket #79. */}
            {facture.devis?.bdcClientUrl && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 leading-tight">BDC client (fichier)</p>
                  <p
                    className="text-sm text-slate-700 truncate"
                    title={facture.devis.bdcClientFilename ?? ""}
                  >
                    {facture.devis.bdcClientFilename}
                    {facture.devis.bdcClientUploadedAt && (
                      <span className="ml-2 text-xs text-slate-400">
                        · uploadé le {formatDate(facture.devis.bdcClientUploadedAt)}
                      </span>
                    )}
                  </p>
                </div>
                <a
                  href={facture.devis.bdcClientUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Ouvrir le BDC dans un nouvel onglet"
                >
                  <ExternalLink className="w-3 h-3" />
                  Voir
                </a>
              </div>
            )}
            <FactureDateEmissionField
              factureId={facture.id}
              initialValue={facture.dateEmission}
              statut={facture.statut}
            />
            <FactureDateReglementField
              factureId={facture.id}
              initialValue={facture.dateReglement}
            />
            {/* Ticket #92 — affichage "Payée le DD/MM/YYYY" quand la
                facture a été marquée payée via le bouton 1 clic.
                datePaiement = timestamp système au moment du bascule
                (à distinguer de dateReglement = saisie manuelle). */}
            {facture.statut === "PAYEE" && facture.datePaiement && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 border border-green-200 rounded-lg bg-green-50">
                <span className="text-xs font-semibold text-green-700">
                  ✓ Payée
                </span>
                <span className="text-sm text-green-800">
                  le {formatDate(facture.datePaiement)}
                </span>
              </div>
            )}
            {/* Période d'exploitation — snapshot du devis source à
                l'émission. Lecture seule (immuabilité légale comme le
                reste de la facture). Ticket #69. */}
            {(facture.periodeExploitationDebut ||
              facture.periodeExploitationFin ||
              facture.periodeExploitationLibelle) && (
              <div className="mt-3 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                <p className="text-xs text-slate-400 leading-tight">
                  Période d&apos;exploitation
                </p>
                <p className="text-sm text-slate-700 mt-0.5">
                  {facture.periodeExploitationDebut && facture.periodeExploitationFin ? (
                    <>
                      du {formatDate(facture.periodeExploitationDebut)}{" "}
                      au {formatDate(facture.periodeExploitationFin)}
                      {facture.periodeExploitationLibelle && (
                        <> — {facture.periodeExploitationLibelle}</>
                      )}
                    </>
                  ) : (
                    facture.periodeExploitationLibelle
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Détail — sections/lignes lues depuis le devis lié,
              valeurs ramenées au prorata (ratio = facture.totalHt / devis.totalHt).
              Fallback single-line pour les factures sans devis (NONNA/SACEM). */}
          {facture.devis && facture.devis.sections.length > 0 ? (
            (() => {
              const ratio =
                facture.devis!.totalHt > 0
                  ? facture.totalHt / facture.devis!.totalHt
                  : 1;
              return (
                <>
                  <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                      <h4 className="font-semibold text-slate-800">
                        {facture.type === "ACOMPTE"
                          ? `Acompte ${Math.round(ratio * 100)}% sur devis n° ${facture.devis!.numero}`
                          : `Solde sur devis n° ${facture.devis!.numero}`}
                      </h4>
                      {facture.devis!.objet && (
                        <span className="text-sm text-slate-500">
                          {facture.devis!.objet}
                        </span>
                      )}
                    </div>
                    {facture.devis!.sections.map((section) => (
                      <div key={section.id} className="border-t border-slate-100">
                        <div className="px-5 py-2.5 bg-slate-50/40 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          {section.titre}
                        </div>
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="text-left px-5 py-2 text-xs text-slate-400 font-medium">
                                Libellé
                              </th>
                              <th className="text-right px-5 py-2 text-xs text-slate-400 font-medium w-20">
                                Qté
                              </th>
                              <th className="text-right px-5 py-2 text-xs text-slate-400 font-medium w-32">
                                P.U. HT
                              </th>
                              <th className="text-right px-5 py-2 text-xs text-slate-400 font-medium w-32">
                                Total HT
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.lignes.map((ligne) => {
                              const pu = Math.round(ligne.prixUnit * ratio * 100) / 100;
                              const tot = Math.round(ligne.total * ratio * 100) / 100;
                              return (
                                <tr key={ligne.id} className="border-t border-slate-50">
                                  <td className="px-5 py-3 text-sm text-slate-700">
                                    {ligne.libelle}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-600">
                                    {ligne.quantite}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-right tabular-nums text-slate-600">
                                    {formatEuros(pu)}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-right tabular-nums font-medium text-slate-900">
                                    {formatEuros(tot)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()
          ) : (
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
                      {isAvoir && facture.devis
                        ? `Avoir sur devis n° ${facture.devis.numero}`
                        : FACTURE_TYPE_LABELS[facture.type]}
                    </td>
                    <td className="px-5 py-4 text-sm text-right tabular-nums font-medium text-slate-900">
                      {isAvoir
                        ? `- ${formatEuros(Math.abs(totalHtNet))}`
                        : formatEuros(totalHtNet)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

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
              {/* Sous-total + CS/FG/Marge : affichés seulement si on a un
                  breakdown valide. Lignes à 0 € masquées (cf. devis). */}
              {!isAvoir && facture.sousTotal > 0 && (
                <>
                  {(
                    [
                      { label: "Sous-total HT", value: facture.sousTotal, alwaysShow: true },
                      { label: `CS Comédiens (${formatPct(facture.tauxCsComedien)})`, value: facture.csComedien },
                      { label: `CS Techniciens (${formatPct(facture.tauxCsTech)})`, value: facture.csTechniciens },
                      { label: `FG (${formatPct(facture.tauxFg)})`, value: facture.fraisGeneraux },
                      { label: `Marge (${formatPct(facture.tauxMarge)})`, value: facture.marge },
                      { label: "Co-production", value: -facture.coproduction },
                      { label: "Remise exceptionnelle", value: -facture.remise },
                    ] as { label: string; value: number; alwaysShow?: boolean }[]
                  )
                    .filter((r) => r.alwaysShow || r.value !== 0)
                    .map((r) => (
                      <div key={r.label} className="flex justify-between">
                        <span className="text-slate-500">{r.label}</span>
                        <span className="tabular-nums text-slate-700">
                          {formatEuros(r.value)}
                        </span>
                      </div>
                    ))}
                  <div className="border-t border-slate-100 pt-2 mt-2" />
                </>
              )}
              <div className="flex justify-between font-semibold">
                <span>{isAvoir ? "Avoir HT" : "Total HT"}</span>
                <span className="tabular-nums">
                  {isAvoir
                    ? `- ${formatEuros(Math.abs(totalHtNet))}`
                    : formatEuros(totalHtNet)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">
                  TVA {(facture.tauxTva % 1 === 0 ? facture.tauxTva.toFixed(0) : String(facture.tauxTva).replace(".", ","))}%
                </span>
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
