import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ClientForm } from "@/components/clients/ClientForm";

export default async function ModifierClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const client = await db.client.findFirst({ where: { id } });
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          {client.name}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          Modifier le client
        </h1>
      </div>
      <ClientForm
        initialData={{
          id: client.id,
          name: client.name,
          siret: client.siret,
          tvaIntra: client.tvaIntra,
          address: client.address,
          city: client.city,
          postalCode: client.postalCode,
          email: client.email,
          phone: client.phone,
          notes: client.notes,
        }}
      />
    </div>
  );
}
