import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getActor } from "@/lib/auth-context";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { prisma } from "@/lib/prisma";
import { Shield } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { isImpersonating } = await getActor();
  return {
    title: {
      template: isImpersonating ? "👑 IMPERSONATION — %s" : "%s · Admin · ProdBill",
      default: isImpersonating ? "👑 IMPERSONATION — Admin · ProdBill" : "Admin · ProdBill",
    },
  };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const actor = await getActor();

  // Si en impersonation, on doit pouvoir afficher le banner (nom company + user cible)
  let bannerProps: React.ComponentProps<typeof ImpersonationBanner> | null = null;
  if (actor.isImpersonating && actor.user && actor.realEmail) {
    const company = await prisma.company.findUnique({
      where: { id: actor.user.companyId },
      select: { name: true },
    });
    bannerProps = {
      impersonatedCompanyName: company?.name ?? "—",
      impersonatedUserName: actor.user.name || actor.user.email,
      impersonatedUserRole: actor.user.role,
      realEmail: actor.realEmail,
    };
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC]">
      {bannerProps && <ImpersonationBanner {...bannerProps} />}
      <header className="bg-slate-950 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/admin/workspaces" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-red-600/90 flex items-center justify-center shadow-md shadow-red-900/40 group-hover:bg-red-500 transition-colors">
              <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-white font-bold text-[15px] tracking-tight leading-none block">
                ProdBill
              </span>
              <span className="text-red-300 text-[10px] tracking-widest uppercase leading-none block mt-0.5">
                Super-admin
              </span>
            </div>
          </Link>
          <nav className="ml-6 flex items-center gap-1">
            <Link
              href="/admin/workspaces"
              className="px-3 py-1.5 rounded-md text-sm text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              Workspaces
            </Link>
          </nav>
          <div className="flex-1" />
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            ← Retour au dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
