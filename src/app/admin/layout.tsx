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
      template: isImpersonating ? "IMPERSONATION — %s" : "%s · Admin · ProdBill",
      default: isImpersonating ? "IMPERSONATION — Admin · ProdBill" : "Admin · ProdBill",
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
    <div className="min-h-screen bg-brand-cream">
      {bannerProps && <ImpersonationBanner {...bannerProps} />}
      <header className="bg-brand-ink text-brand-cream border-b border-brand-ink-muted">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/admin/workspaces" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-[var(--radius-control)] bg-brand-coral/90 flex items-center justify-center group-hover:bg-brand-coral transition-colors">
              <Shield className="w-4 h-4 text-brand-cream" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-brand-cream font-bold text-[15px] tracking-tight leading-none block">
                ProdBill
              </span>
              <span className="text-brand-coral text-[10px] tracking-widest uppercase leading-none block mt-0.5">
                Super-admin
              </span>
            </div>
          </Link>
          <nav className="ml-6 flex items-center gap-1">
            <Link
              href="/admin/workspaces"
              className="px-3 py-1.5 rounded-md text-sm text-brand-ink-subtle hover:text-brand-cream hover:bg-brand-ink-muted/40 transition-colors"
            >
              Workspaces
            </Link>
          </nav>
          <div className="flex-1" />
          <Link
            href="/"
            className="text-xs text-brand-ink-subtle hover:text-brand-cream transition-colors"
          >
            ← Retour au dashboard
          </Link>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
