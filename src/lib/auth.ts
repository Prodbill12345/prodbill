import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Permission, Role } from "@/types";
import { PERMISSIONS } from "@/types";
import { isAdminEmail } from "@/lib/admin";
import { IMPERSONATE_COOKIE, type ImpersonationPayload } from "@/lib/auth-context";

export class UnauthorizedError extends Error {
  constructor() {
    super("Non authentifié");
  }
}

export class ForbiddenError extends Error {
  constructor(permission?: string) {
    super(permission ? `Permission refusée : ${permission}` : "Accès interdit");
  }
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Vérifie l'auth Clerk et retourne l'utilisateur DB avec sa société.
 * Lance UnauthorizedError si non connecté, ForbiddenError si permission manquante.
 *
 * Si le cookie d'impersonation est posé ET que l'utilisateur réel est dans
 * ADMIN_EMAILS, on retourne le user cible (et sa company) — pour que les
 * writes API se fassent dans le workspace impersoné, cohérent avec la vue SSR.
 */
export async function requireAuth(permission?: Permission) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new UnauthorizedError();

  // ─── Branchement impersonation ───────────────────────────────────────────
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (rawCookie) {
    try {
      const payload = JSON.parse(rawCookie) as ImpersonationPayload;
      if (payload.realClerkId === clerkId) {
        const realClerk = await currentUser();
        const realEmail = realClerk?.emailAddresses[0]?.emailAddress;
        if (isAdminEmail(realEmail)) {
          const target = await prisma.user.findUnique({
            where: { id: payload.impersonatedUserId },
            include: { company: true },
          });
          if (target && target.companyId === payload.impersonatedCompanyId) {
            if (permission && !hasPermission(target.role, permission)) {
              throw new ForbiddenError(permission);
            }
            return target;
          }
        }
      }
    } catch {
      /* cookie corrompu, fallback sur user réel */
    }
  }

  // ─── Chemin normal ───────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: { company: true },
  });
  if (!user) throw new UnauthorizedError();

  if (permission && !hasPermission(user.role, permission)) {
    throw new ForbiddenError(permission);
  }

  return user;
}

/**
 * Middleware helper pour les routes API : renvoie une Response d'erreur
 * si l'utilisateur n'est pas autorisé.
 */
export function handleAuthError(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  console.error(error);
  return Response.json({ error: "Erreur serveur" }, { status: 500 });
}
