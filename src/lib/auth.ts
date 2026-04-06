import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Permission, Role } from "@/types";
import { PERMISSIONS } from "@/types";

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
 */
export async function requireAuth(permission?: Permission) {
  const { userId: clerkId } = await auth();

  if (!clerkId) throw new UnauthorizedError();

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
