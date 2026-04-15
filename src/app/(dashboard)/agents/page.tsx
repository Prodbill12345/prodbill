import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AgentsClient } from "@/components/agents/AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const agents = await prisma.agent.findMany({
    where: { companyId: user.companyId },
    orderBy: [{ agence: "asc" }, { nom: "asc" }],
  });

  return <AgentsClient agents={agents} />;
}
