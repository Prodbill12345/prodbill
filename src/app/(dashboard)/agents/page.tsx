import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { scopedPrisma } from "@/lib/scoped-prisma";
import { redirect } from "next/navigation";
import { AgentsClient } from "@/components/agents/AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const agents = await db.agent.findMany({
    orderBy: [{ agence: "asc" }, { nom: "asc" }],
  });

  return <AgentsClient agents={agents} />;
}
