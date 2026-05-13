/**
 * POST /api/admin/impersonate/start
 * Body : { companyId: string }
 *
 * - Vérifie que l'appelant est dans ADMIN_EMAILS
 * - Pioche un user "cible" dans la Company visée (priorité ADMIN, puis n'importe lequel)
 * - Pose un cookie httpOnly prodbill_impersonate
 * - Écrit AuditLog START_IMPERSONATION dans la Company impersonée
 * - Renvoie 200 (le client redirigera côté JS vers `/`)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import { IMPERSONATE_COOKIE, type ImpersonationPayload } from "@/lib/auth-context";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const u = await currentUser();
  const email = u?.emailAddresses[0]?.emailAddress ?? null;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { companyId?: string };
  const companyId = body.companyId;
  if (!companyId) return NextResponse.json({ error: "companyId requis" }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });

  // Pioche du target : ADMIN en priorité, sinon premier user créé
  const target =
    (await prisma.user.findFirst({
      where: { companyId, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.user.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    }));

  if (!target) {
    return NextResponse.json(
      { error: "Aucun utilisateur à impersonner dans ce workspace" },
      { status: 409 }
    );
  }

  const payload: ImpersonationPayload = {
    realClerkId: clerkId,
    realEmail: email!,
    impersonatedUserId: target.id,
    impersonatedCompanyId: company.id,
    startedAt: Date.now(),
  };

  // AuditLog dans la Company impersonée. Le userId est le target (FK valide),
  // l'identité réelle est conservée dans details.
  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userId: target.id,
      userName: `[ADMIN ${email}]`,
      action: "START_IMPERSONATION",
      entityType: "Company",
      entityId: company.id,
      details: {
        impersonatedBy: email,
        impersonatedByClerkId: clerkId,
        targetUserId: target.id,
        targetUserName: target.name,
        targetUserEmail: target.email,
      },
    },
  });

  const res = NextResponse.json({
    ok: true,
    companyId: company.id,
    targetUserId: target.id,
  });
  res.cookies.set(IMPERSONATE_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1h
  });
  return res;
}
