import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ParametresForm } from "@/components/parametres/ParametresForm";

export default async function ParametresPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { company: true },
  });

  if (!user) redirect("/sign-in");

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-slate-500 mt-1">Configuration de votre société</p>
      </div>
      <ParametresForm company={user.company} userRole={user.role} />
    </div>
  );
}
