/**
 * POST /api/admin/impersonate/exit
 * - Lit le cookie impersonation, écrit AuditLog EXIT_IMPERSONATION
 * - Supprime le cookie
 * - Renvoie 200
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { IMPERSONATE_COOKIE, type ImpersonationPayload } from "@/lib/auth-context";

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = await currentUser();
  const email = u?.emailAddresses[0]?.emailAddress ?? null;
  // On exige toujours admin pour exit (cohérent avec start)
  if (!isAdminEmail(email)) {
    // On retire quand même le cookie pour ne pas bloquer le user
    const res = NextResponse.json({ ok: true, note: "cookie cleared (non-admin)" });
    res.cookies.delete(IMPERSONATE_COOKIE);
    return res;
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  let payload: ImpersonationPayload | null = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
  }

  if (payload && payload.realClerkId === clerkId) {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: payload.impersonatedCompanyId,
          userId: payload.impersonatedUserId,
          userName: `[ADMIN ${email}]`,
          action: "EXIT_IMPERSONATION",
          entityType: "Company",
          entityId: payload.impersonatedCompanyId,
          details: {
            impersonatedBy: email,
            impersonatedByClerkId: clerkId,
            durationMs: Date.now() - payload.startedAt,
          },
        },
      });
    } catch {
      // Best-effort : si le log échoue (FK supprimée…), on n'empêche pas la sortie
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(IMPERSONATE_COOKIE);
  return res;
}
