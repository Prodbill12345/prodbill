import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Mascot } from "@/components/brand/Mascot";

export default async function ClientsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const db = scopedPrisma(user.companyId);
  const clients = await db.client.findMany({
    include: {
      _count: { select: { devis: true, factures: true } },
    },
    orderBy: { name: "asc" },
  });

  // Generate a consistent color from client name
  const colors = [
    // Palette DA : teintes douces + encre (contrastes AA vérifiés).
    { bg: "bg-status-info-bg", text: "text-brand-blue" },
    { bg: "bg-status-success-bg", text: "text-brand-ink" },
    { bg: "bg-status-partial-bg", text: "text-brand-ink" },
    { bg: "bg-status-danger-bg", text: "text-brand-ink" },
    { bg: "bg-brand-surface", text: "text-brand-ink" },
    { bg: "bg-brand-pistachio", text: "text-brand-ink" },
    { bg: "bg-brand-ink", text: "text-brand-cream" },
  ];

  function clientColor(name: string) {
    const idx = name.charCodeAt(0) % colors.length;
    return colors[idx];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Clients</h1>
          <p className="text-brand-ink-muted mt-0.5 text-sm">
            {clients.length} client{clients.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/clients/nouveau"
          className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-16 text-center">
          <Mascot size={88} className="mx-auto mb-4" />
          <h3 className="font-display text-lg font-semibold text-brand-ink mb-2">
            Aucun client
          </h3>
          <p className="text-brand-ink-muted mb-6 text-sm">
            Ajoutez votre premier client pour commencer
          </p>
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-control)] text-sm font-semibold text-brand-cream bg-brand-blue hover:bg-brand-ink transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Nouveau client
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => {
            const color = clientColor(client.name);
            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="bg-brand-paper rounded-[var(--radius-card)] border border-brand-rule p-5 hover:border-brand-ink-subtle transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-[var(--radius-card)] ${color.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                  >
                    <span className={`${color.text} font-bold text-sm`}>
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="font-semibold text-brand-ink group-hover:text-brand-blue transition-colors truncate">
                      {client.name}
                    </h3>
                    {client.siret && (
                      <p className="text-xs text-brand-ink-muted mt-0.5 font-mono truncate">
                        {client.siret}
                      </p>
                    )}
                  </div>
                </div>

                {client.email && (
                  <p className="text-sm text-brand-ink-muted truncate mb-3">{client.email}</p>
                )}

                <div className="flex gap-4 pt-3 border-t border-brand-rule">
                  <div className="text-center">
                    <p className="text-base font-bold text-brand-ink">{client._count.devis}</p>
                    <p className="text-xs text-brand-ink-muted">devis</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-brand-ink">{client._count.factures}</p>
                    <p className="text-xs text-brand-ink-muted">factures</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
