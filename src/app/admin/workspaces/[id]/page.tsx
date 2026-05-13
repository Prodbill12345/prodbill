import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Activity,
  FileText,
  Receipt,
  CreditCard,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";

export const dynamic = "force-dynamic";

const eurFmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminWorkspaceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) notFound();

  const [
    users,
    auditLogs,
    devisCount,
    factureCount,
    clientsCount,
    fullyPaidAgg,
    partialPaiementsAgg,
    partialFacturesAgg,
    openAgg,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clerkId: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { companyId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        userName: true,
        createdAt: true,
        details: true,
      },
    }),
    prisma.devis.count({ where: { companyId: id } }),
    prisma.facture.count({ where: { companyId: id } }),
    prisma.client.count({ where: { companyId: id } }),
    // Voir page liste : strategie hybride statut Facture + Paiements lies.
    prisma.facture.aggregate({
      where: { companyId: id, statut: "PAYEE" },
      _sum: { totalTtc: true },
    }),
    prisma.paiement.aggregate({
      where: { companyId: id, facture: { statut: "PAYEE_PARTIEL" } },
      _sum: { montant: true },
    }),
    prisma.facture.aggregate({
      where: { companyId: id, statut: "PAYEE_PARTIEL" },
      _sum: { totalTtc: true },
    }),
    prisma.facture.aggregate({
      where: { companyId: id, statut: { in: ["EMISE", "EN_RETARD"] } },
      _sum: { totalTtc: true },
    }),
  ]);

  const fullyPaid = Number(fullyPaidAgg._sum.totalTtc ?? 0);
  const partialPaiements = Number(partialPaiementsAgg._sum.montant ?? 0);
  const partialFactures = Number(partialFacturesAgg._sum.totalTtc ?? 0);
  const openTtc = Number(openAgg._sum.totalTtc ?? 0);

  const caPaye = fullyPaid + partialPaiements;
  const caEnAttente = openTtc + Math.max(0, partialFactures - partialPaiements);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/workspaces"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour à la liste
      </Link>

      {/* Header workspace */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-5">
        {company.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt={company.name}
            className="w-16 h-16 rounded-xl object-contain bg-slate-50 border border-slate-100 shrink-0"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: company.primaryColor + "20" }}
          >
            <Building2 className="w-8 h-8" style={{ color: company.primaryColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            <span className="font-mono">{company.siret}</span>
            <span className="mx-2 text-slate-300">·</span>
            {company.tvaIntra}
            <span className="mx-2 text-slate-300">·</span>
            Créée le {dateTimeFmt.format(company.createdAt)}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {company.address}, {company.postalCode} {company.city}
          </p>
        </div>
        <ImpersonateButton companyId={company.id} companyName={company.name} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Utilisateurs" value={users.length} accent="violet" />
        <StatCard icon={FileText} label="Devis" value={devisCount} accent="indigo" />
        <StatCard icon={Receipt} label="Factures" value={factureCount} accent="emerald" />
        <StatCard
          icon={CreditCard}
          label="CA encaissé"
          value={caPaye > 0 ? eurFmt.format(caPaye) : "—"}
          accent="amber"
        />
      </div>

      {/* Grid Infos + Users + Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infos Company */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">
            Configuration
          </h2>
          <dl className="space-y-2.5 text-sm">
            <Row label="Clerk Org" value={company.clerkOrgId ?? "—"} mono />
            <Row label="Email facturation" value={company.email || "—"} />
            <Row label="Téléphone" value={company.phone || "—"} />
            <Row label="IBAN" value={company.iban} mono />
            <Row label="BIC" value={company.bic} mono />
            <Row label="Banque" value={company.nomBanque || "—"} />
            <div className="border-t border-slate-100 my-2" />
            <Row label="CS Comédien" value={`${(company.defaultTauxCsComedien * 100).toFixed(0)} %`} />
            <Row label="CS Tech" value={`${(company.defaultTauxCsTech * 100).toFixed(0)} %`} />
            <Row label="FG" value={`${(company.defaultTauxFg * 100).toFixed(0)} %`} />
            <Row label="Marge" value={`${(company.defaultTauxMarge * 100).toFixed(0)} %`} />
            <div className="border-t border-slate-100 my-2" />
            <Row label="Préfixe devis" value={company.prefixDevis || "—"} mono />
            <Row label="Préfixe facture" value={company.prefixFacture || "—"} mono />
            <Row label="Clients" value={String(clientsCount)} />
            <Row label="CA en attente" value={caEnAttente > 0 ? eurFmt.format(caEnAttente) : "—"} />
          </dl>
        </div>

        {/* Users */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            Utilisateurs ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucun utilisateur.</p>
          ) : (
            <ul className="space-y-2.5">
              {users.map((u) => (
                <li key={u.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-slate-600 text-xs font-bold">
                      {(u.name || u.email).slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 text-sm truncate">
                      {u.name || u.email.split("@")[0]}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{u.email}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {u.role}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        depuis le {dateTimeFmt.format(u.createdAt)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AuditLog */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            Activité récente
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Aucune activité enregistrée.</p>
          ) : (
            <ul className="space-y-3">
              {auditLogs.map((log) => (
                <li key={log.id} className="text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-mono font-semibold px-1.5 py-0.5 rounded ${
                        log.action.includes("IMPERSON")
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="text-slate-400">{log.entityType}</span>
                  </div>
                  <div className="text-slate-500 mt-1">
                    {log.userName}{" "}
                    <span className="text-slate-300">·</span>{" "}
                    <span className="text-slate-400">{dateTimeFmt.format(log.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd
        className={`text-slate-700 text-right truncate ${
          mono ? "font-mono text-xs" : "text-sm"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: "violet" | "indigo" | "emerald" | "amber";
}) {
  const accents = {
    violet: { bg: "bg-violet-50", text: "text-violet-600" },
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600" },
  } as const;
  const a = accents[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${a.bg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${a.text}`} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
        <div className="text-lg font-bold text-slate-900 tabular-nums truncate">
          {value}
        </div>
      </div>
    </div>
  );
}
