import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  // Vérifier que l'utilisateur a un profil en base
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  // Premier login : rediriger vers l'onboarding
  if (!user) redirect("/onboarding");

  return (
    <div className="flex h-screen bg-[#F8F9FC]">
      <Sidebar />
      <main className="flex-1 ml-60 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
