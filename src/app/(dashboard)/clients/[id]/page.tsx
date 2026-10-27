import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText, Mail, Phone, MapPin, Pencil } from "lucide-react";
import { formatEuros } from "@/lib/calculations";
import { formatDate } from "@/lib/utils";
import { DEVIS_STATUT_LABELS, FACTURE_STATUT_LABELS } from "@/types";
import { StatusBadge } from "@/components/brand/StatusBadge";
import { DEVIS_STATUT_TONE, FACTURE_STATUT_TONE } from "@/design/status";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const client = await db.client.findFirst({
    where: { id },
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
          className="inline-flex items-center gap-1 text-sm text-brand-ink-muted hover:text-brand-ink mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Clients
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-status-info-bg flex items-center justify-center">
              <span className="text-brand-blue font-bold">
                {client.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">{client.name}</h1>
              {client.siret && (
                <p className="text-sm text-brand-ink-muted font-mono mt-0.5">
                  SIRET {client.siret}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clients/${client.id}/modifier`}
              className="flex items-center gap-2 px-4 py-2 border border-brand-rule rounded-[var(--radius-control)] text-sm font-medium text-brand-ink hover:bg-brand-surface hover:border-brand-rule transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Modifier
            </Link>
            <Link
              href={`/devis/nouveau?clientId=${client.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-brand-blue rounded-[var(--radius-control)] text-sm font-medium text-brand-cream hover:bg-brand-ink transition-colors"
            >
              <FileText className="w-4 h-4" />
              Nouveau devis
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Colonne gauche — infos */}
        <div className="space-y-4">
          {/* Coordonnées */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5 space-y-3">
            <h3 className="font-semibold text-brand-ink">Coordonnées</h3>
            <div className="space-y-2 text-sm">
              {client.address && (
                <div className="flex items-start gap-2 text-brand-ink-muted">
                  <MapPin className="w-4 h-4 mt-0.5 text-brand-ink-subtle shrink-0" />
                  <span>
                    {client.address}
                    {(client.postalCode || client.city) && (
                      <><br />{[client.postalCode, client.city].filter(Boolean).join(" ")}</>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-brand-ink-muted">
                <Mail className="w-4 h-4 text-brand-ink-subtle shrink-0" />
                {client.email ? (
                  <a href={`mailto:${client.email}`} className="hover:text-brand-blue">
                    {client.email}
                  </a>
                ) : (
                  <span className="italic text-brand-ink-muted">(pas d&apos;email renseigné)</span>
                )}
              </div>
              {client.phone && (
                <div className="flex items-center gap-2 text-brand-ink-muted">
                  <Phone className="w-4 h-4 text-brand-ink-subtle shrink-0" />
                  <span>{client.phone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Infos fiscales */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5 space-y-2">
            <h3 className="font-semibold text-brand-ink">Infos fiscales</h3>
            <div className="space-y-1 text-sm">
              {client.siret && (
                <div className="flex justify-between">
                  <span className="text-brand-ink-muted">SIRET</span>
                  <span className="font-mono text-brand-ink">{client.siret}</span>
                </div>
              )}
              {client.tvaIntra && (
                <div className="flex justify-between">
                  <span className="text-brand-ink-muted">TVA intra</span>
                  <span className="font-mono text-brand-ink">{client.tvaIntra}</span>
                </div>
              )}
              {!client.siret && !client.tvaIntra && (
                <p className="text-brand-ink-muted text-xs">Aucune info fiscale renseignée</p>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
            <h3 className="font-semibold text-brand-ink mb-3">Statistiques</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-ink-muted">Devis</span>
                <span className="font-semibold text-brand-ink">{client.devis.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-ink-muted">Factures</span>
                <span className="font-semibold text-brand-ink">{client.factures.length}</span>
              </div>
              <div className="flex justify-between border-t border-brand-rule pt-2 mt-2">
                <span className="text-brand-ink-muted">CA encaissé</span>
                <span className="font-bold text-brand-ink">{formatEuros(caTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5">
              <h3 className="font-semibold text-brand-ink mb-2">Notes</h3>
              <p className="text-sm text-brand-ink-muted whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        {/* Colonne droite — devis + factures */}
        <div className="col-span-2 space-y-5">
          {/* Devis */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-rule">
              <h3 className="font-semibold text-brand-ink">Devis</h3>
              <span className="text-xs text-brand-ink-muted">{client.devis.length} au total</span>
            </div>
            {client.devis.length === 0 ? (
              <p className="text-sm text-brand-ink-muted text-center py-8">
                Aucun devis pour ce client
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-rule">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Réf.</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Objet</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Date</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-brand-ink-muted">Total TTC</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-rule">
                  {client.devis.map((d) => (
                    <tr key={d.id} className="hover:bg-brand-surface transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/devis/${d.id}`} className="text-sm font-medium text-brand-blue hover:text-brand-blue">
                          {d.numero ?? "Brouillon"}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-brand-ink-muted max-w-[14rem] truncate">{d.objet}</td>
                      <td className="px-5 py-3 text-sm text-brand-ink-muted">{formatDate(d.createdAt)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-brand-ink text-right">
                        {formatEuros(d.totalTtc)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={DEVIS_STATUT_TONE[d.statut]} label={DEVIS_STATUT_LABELS[d.statut]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Factures */}
          <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule overflow-x-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-rule">
              <h3 className="font-semibold text-brand-ink">Factures</h3>
              <span className="text-xs text-brand-ink-muted">{client.factures.length} au total</span>
            </div>
            {client.factures.length === 0 ? (
              <p className="text-sm text-brand-ink-muted text-center py-8">
                Aucune facture pour ce client
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-brand-rule">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">N°</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Échéance</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-brand-ink-muted">Total TTC</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-brand-ink-muted">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-rule">
                  {client.factures.map((f) => (
                    <tr key={f.id} className="hover:bg-brand-surface transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/factures/${f.id}`} className="text-sm font-medium text-brand-blue hover:text-brand-blue">
                          {f.numero}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-brand-ink-muted">{formatDate(f.dateEmission)}</td>
                      <td className="px-5 py-3 text-sm text-brand-ink-muted">{formatDate(f.dateEcheance)}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-brand-ink text-right">
                        {formatEuros(f.totalTtc)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={FACTURE_STATUT_TONE[f.statut]} label={FACTURE_STATUT_LABELS[f.statut]} />
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
