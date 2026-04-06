import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Plus, Users } from "lucide-react";

export default async function ClientsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return null;

  const clients = await prisma.client.findMany({
    where: { companyId: user.companyId },
    include: {
      _count: { select: { devis: true, factures: true } },
    },
    orderBy: { name: "asc" },
  });

  // Generate a consistent color from client name
  const colors = [
    { bg: "bg-violet-100", text: "text-violet-700" },
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-rose-100", text: "text-rose-700" },
    { bg: "bg-indigo-100", text: "text-indigo-700" },
    { bg: "bg-teal-100", text: "text-teal-700" },
  ];

  function clientColor(name: string) {
    const idx = name.charCodeAt(0) % colors.length;
    return colors[idx];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-0.5 text-sm">
            {clients.length} client{clients.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/clients/nouveau"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-md shadow-violet-900/20 hover:shadow-violet-900/30 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Nouveau client
        </Link>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="w-16 h-16 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-violet-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            Aucun client
          </h3>
          <p className="text-slate-400 mb-6 text-sm">
            Ajoutez votre premier client pour commencer
          </p>
          <Link
            href="/clients/nouveau"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-md transition-all"
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
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-violet-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                  >
                    <span className={`${color.text} font-bold text-sm`}>
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h3 className="font-semibold text-slate-900 group-hover:text-violet-700 transition-colors truncate">
                      {client.name}
                    </h3>
                    {client.siret && (
                      <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">
                        {client.siret}
                      </p>
                    )}
                  </div>
                </div>

                {client.email && (
                  <p className="text-sm text-slate-500 truncate mb-3">{client.email}</p>
                )}

                <div className="flex gap-4 pt-3 border-t border-slate-50">
                  <div className="text-center">
                    <p className="text-base font-bold text-slate-800">{client._count.devis}</p>
                    <p className="text-xs text-slate-400">devis</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base font-bold text-slate-800">{client._count.factures}</p>
                    <p className="text-xs text-slate-400">factures</p>
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
