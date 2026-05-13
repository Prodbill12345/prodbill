import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { getActor } from "@/lib/auth-context";
import { isAdminEmail } from "@/lib/admin";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { isImpersonating } = await getActor();
  return {
    title: {
      template: isImpersonating ? "👑 IMPERSONATION — %s" : "%s · ProdBill",
      default: isImpersonating ? "👑 IMPERSONATION — ProdBill" : "ProdBill",
    },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor.realUser && !actor.user) redirect("/sign-in");
  if (!actor.user) redirect("/onboarding");

  const isAdmin = isAdminEmail(actor.realEmail);

  // Banner props : seulement si impersonation active
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
    <div className="flex h-screen bg-[#F8F9FC]">
      <Sidebar isAdmin={isAdmin} />
      <main className="flex-1 ml-60 overflow-y-auto">
        {bannerProps && <ImpersonationBanner {...bannerProps} />}
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
