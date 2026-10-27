import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileDown, Send, CheckCircle, Receipt, Info } from "lucide-react";
import { formatEuros, formatPct, formatQuantite } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_LABELS, LIGNE_TAG_LABELS, LIGNE_TAG_COLORS } from "@/types";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { DEVIS_STATUT_TONE } from "@/design/status";
import { DevisActions } from "@/components/devis/DevisActions";
import { devisRecapVisibility } from "@/lib/devis-recap-visibility";
import { formatTvaLabel } from "@/lib/tva-label";
import {
  getFacturationState,
  toFactureForFacturation,
  FACTURE_FACTURATION_SELECT,
} from "@/lib/devis-facturation-state";
import { FACTURE_STATUT_LABELS, FACTURE_TYPE_LABELS } from "@/types";

export default async function DevisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const devis = await db.devis.findFirst({
    where: { id },
    include: {
      client: true,
      company: { select: { hideTvaTtcOnDevis: true } },
      sections: {
        include: { lignes: { orderBy: { ordre: "asc" } } },
        orderBy: { ordre: "asc" },
      },
      bdc: true,
      // Les factures liées sont chargées séparément (facturesLiees ci-dessous)
      // pour couvrir mono ET récap via la table de liaison FactureDevis.
      // Traçabilité duplication (ticket #93) : si non null, ce devis a
      // été créé via /api/devis/[id]/dupliquer.
      devisSource: { select: { id: true, numero: true, objet: true } },
    },
  });

  if (!devis) notFound();

  // NONNA : masque TVA + TTC sur les devis (pur affichage). Cf. company flag.
  const { showTva, showTtc } = devisRecapVisibility(devis.company);

  // Factures liées à ce devis — mono (devisId miroir) ET récap (FactureDevis).
  // Une seule requête sert trois usages : l'avertissement #99 sur les
  // brouillons, le garde-fou anti double-facturation (boutons Acompte/Solde) et
  // la liste « Factures générées » ci-dessous.
  const facturesLiees = await db.facture.findMany({
    where: {
      OR: [{ devisId: id }, { devisLinks: { some: { devisId: id } } }],
    },
    select: {
      ...FACTURE_FACTURATION_SELECT,
      id: true,
      numero: true,
      totalTtc: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // #99 : ce devis est-il lié à des factures BROUILLON ? Si oui, avertir que
  // les modifs s'y répercutent tant que la facture n'est pas émise.
  const brouillonFacturesCount = facturesLiees.filter(
    (f) => f.statut === "BROUILLON"
  ).length;

  // GUARD-DEVIS-DOUBLE-FACTURATION : prédicat partagé avec les routes serveur.
  const facturation = getFacturationState(
    facturesLiees.map(toFactureForFacturation)
  );

  return (
    <div className="space-y-6">
      {brouillonFacturesCount > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--radius-card)] border border-status-partial-bg bg-status-partial-bg text-sm text-brand-ink">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Ce devis est lié à {brouillonFacturesCount} brouillon
            {brouillonFacturesCount > 1 ? "s" : ""} de facture. Vos modifications
            se répercutent sur {brouillonFacturesCount > 1 ? "leurs" : "son"}{" "}
            total tant {brouillonFacturesCount > 1 ? "qu'elles ne sont" : "qu'elle n'est"}{" "}
            pas émise{brouillonFacturesCount > 1 ? "s" : ""}.
          </span>
        </div>
      )}
      {/* Header */}
      <div>
        <Link
          href="/devis"
          className="inline-flex items-center gap-1 text-sm text-brand-ink-muted hover:text-brand-ink mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Devis
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">
                {devis.numero ?? "Brouillon"}
              </h1>
              <StatusBadge tone={DEVIS_STATUT_TONE[devis.statut]} label={DEVIS_STATUT_LABELS[devis.statut]} />
            </div>
            <p className="text-brand-ink-muted mt-1">{devis.objet}</p>
            {/* Mention "Dupliqué depuis ..." si le devis a été créé via
                /api/devis/[id]/dupliquer. Ticket #93. */}
            {devis.devisSource && (
              <p className="text-xs text-brand-ink-muted mt-1">
                Dupliqué depuis{" "}
                <Link
                  href={`/devis/${devis.devisSource.id}`}
                  className="text-brand-blue hover:text-brand-blue hover:underline"
                >
                  {devis.devisSource.numero ?? "(brouillon)"}
                </Link>
                {devis.devisSource.objet && (
                  <span className="text-brand-ink-muted"> — {devis.devisSource.objet}</span>
                )}
              </p>
            )}
          </div>
          <DevisActions devis={devis} facturation={facturation} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Contenu principal */}
        <div className="col-span-2 space-y-5">
          {/* Infos client */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
            <h3 className="font-semibold text-brand-ink mb-3">Client</h3>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-brand-ink">{devis.client.name}</p>
                <p className="text-sm text-brand-ink-muted mt-0.5">{devis.client.email}</p>
                {devis.client.siret && (
                  <p className="text-xs text-brand-ink-muted font-mono mt-1">
                    SIRET {devis.client.siret}
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-brand-ink-muted">
                <p>Créé le {formatDate(devis.createdAt)}</p>
                {devis.dateValidite && (
                  <p>Valide jusqu&apos;au {formatDate(devis.dateValidite)}</p>
                )}
                {devis.bdc && (
                  <p className="text-brand-blue font-medium mt-1">
                    BDC : {devis.bdc.numero}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sections et lignes */}
          {devis.sections.map((section) => (
            <div key={section.id} className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-hidden">
              <div className="px-5 py-3.5 border-b border-brand-rule bg-brand-surface/50">
                <h4 className="font-semibold text-brand-ink">{section.titre}</h4>
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs text-brand-ink-muted font-medium">
                      Libellé
                    </th>
                    <th className="text-left px-5 py-2.5 text-xs text-brand-ink-muted font-medium">
                      Tag
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-brand-ink-muted font-medium">
                      Qté
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-brand-ink-muted font-medium">
                      P.U. HT
                    </th>
                    <th className="text-right px-5 py-2.5 text-xs text-brand-ink-muted font-medium">
                      Total HT
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-rule">
                  {section.lignes.map((ligne) => (
                    <tr key={ligne.id}>
                      <td className="px-5 py-3 text-sm text-brand-ink">
                        {ligne.libelle}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${LIGNE_TAG_COLORS[ligne.tag]}`}
                        >
                          {LIGNE_TAG_LABELS[ligne.tag]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums text-brand-ink-muted">
                        {formatQuantite(ligne.quantite)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums text-brand-ink-muted">
                        {formatEuros(ligne.prixUnit)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right tabular-nums font-medium text-brand-ink">
                        {formatEuros(ligne.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Factures liées — mono ET récap. Avant le garde-fou, ce bloc ne
              lisait que devis.factures (relation mono via devisId), donc une
              facture récapitulative n'apparaissait nulle part sur le devis.
              On liste maintenant facturesLiees : le devis facturé reste
              visible et traçable dans son historique. */}
          {facturesLiees.length > 0 && (
            <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
              <h3 className="font-semibold text-brand-ink mb-3">Factures générées</h3>
              <div className="space-y-2">
                {facturesLiees.map((f) => {
                  const isRecap = f.devisId === null && f._count.devisLinks >= 2;
                  return (
                    <Link
                      key={f.id}
                      href={`/factures/${f.id}`}
                      className="flex items-center justify-between p-3 bg-brand-surface rounded-[var(--radius-control)] hover:bg-status-info-bg transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Receipt className="w-4 h-4 text-brand-ink-muted shrink-0" />
                        <span className="text-sm font-medium text-brand-ink">
                          {f.numero ?? "Brouillon"}
                        </span>
                        <span className="text-xs text-brand-ink-muted truncate">
                          {FACTURE_TYPE_LABELS[f.type]}
                          {isRecap && " · récapitulative"}
                          {" · "}
                          {FACTURE_STATUT_LABELS[f.statut]}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-brand-ink shrink-0">
                        {formatEuros(f.totalTtc)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Panneau totaux */}
        <div className="space-y-4">
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
            <h3 className="font-semibold text-brand-ink mb-4">Récapitulatif</h3>
            <div className="space-y-2 text-sm">
              {(
                [
                  { label: "Sous-total HT", value: devis.sousTotal, alwaysShow: true },
                  { label: `CS Comédiens (${formatPct(devis.tauxCsComedien)})`, value: devis.csComedien },
                  { label: `CS Techniciens (${formatPct(devis.tauxCsTech)})`, value: devis.csTechniciens },
                  { label: `FG (${formatPct(devis.tauxFg)})`, value: devis.fraisGeneraux },
                  { label: `Marge (${formatPct(devis.tauxMarge)})`, value: devis.marge },
                  { label: "Co-production", value: -devis.coproduction },
                  { label: "Remise exceptionnelle", value: -devis.remise },
                ] as { label: string; value: number; alwaysShow?: boolean }[]
              )
                .filter((r) => r.alwaysShow || r.value !== 0)
                .map((r) => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-brand-ink-muted">{r.label}</span>
                    <span className="tabular-nums text-brand-ink">
                      {formatEuros(r.value)}
                    </span>
                  </div>
                ))}
              <div className="border-t border-brand-rule pt-2 mt-2 space-y-1.5">
                {/* TOTAL HT = HT net après remise et co-production (base TVA).
                    Identique à totalHt si pas de remise ni coproduction. */}
                <div className="flex justify-between font-semibold">
                  <span>TOTAL HT</span>
                  <span>{formatEuros(devis.totalApresRemise)}</span>
                </div>
                {showTva && (
                  <div className="flex justify-between text-brand-ink-muted">
                    <span>{formatTvaLabel(devis.tauxTva)}</span>
                    <span>{formatEuros(devis.tva)}</span>
                  </div>
                )}
                {showTtc && (
                  <div className="flex justify-between font-bold text-base border-t border-brand-rule pt-2 mt-2">
                    <span>TOTAL TTC</span>
                    <span className="text-brand-blue">{formatEuros(devis.totalTtc)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {devis.notes && (
            <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
              <h4 className="text-sm font-semibold text-brand-ink mb-2">Notes</h4>
              <p className="text-sm text-brand-ink-muted whitespace-pre-wrap">{devis.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
