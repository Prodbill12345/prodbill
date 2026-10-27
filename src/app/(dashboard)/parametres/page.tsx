import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-context";
import { ParametresForm } from "@/components/parametres/ParametresForm";
import { DocumentsSection } from "@/components/parametres/DocumentsSection";

export default async function ParametresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
  });
  if (!company) redirect("/sign-in");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-brand-ink">Paramètres</h1>
        <p className="text-brand-ink-muted mt-1">Configuration de votre société</p>
      </div>
      <ParametresForm company={company} userRole={user.role} />
      <DocumentsSection canEdit={user.role === "ADMIN"} />
    </div>
  );
}
