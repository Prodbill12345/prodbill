import { scopedPrisma } from "@/lib/scoped-prisma";
import { getCurrentUser } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import { AgentsClient } from "@/components/agents/AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const db = scopedPrisma(user.companyId);
  const agents = await db.agent.findMany({
    orderBy: [{ agence: "asc" }, { nom: "asc" }],
  });

  return <AgentsClient agents={agents} />;
}
