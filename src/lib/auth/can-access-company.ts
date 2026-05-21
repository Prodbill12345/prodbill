/**
 * src/lib/auth/can-access-company.ts
 *
 * Helper d'authz multi-workspace pour Phase 2 (suite #69).
 *
 * Une Membership est ACTIVE si :
 *   - revokedAt IS NULL  (pas révoquée)
 *   - joinedAt IS NOT NULL  (invitation acceptée)
 *
 * Pendant la transition Phase 2, le système est tolérant :
 *   - Si une Membership active existe → on l'utilise comme source de vérité
 *   - Sinon, fallback sur User.companyId (rétrocompat avec le 1-N existant)
 *
 * Le fallback disparaîtra en V3 quand toutes les Memberships seront backfillées
 * et que User.companyId sera retiré du schéma.
 */

import { prisma } from "@/lib/prisma";

/**
 * Retourne true si le user a une Membership active pour la company donnée,
 * OU si User.companyId === companyId (fallback rétrocompat).
 *
 * @param userId    L'id Prisma du User (pas le clerkId)
 * @param companyId L'id Prisma de la Company à vérifier
 */
export async function canAccessCompany(
  userId: string,
  companyId: string
): Promise<boolean> {
  // 1. Recherche d'une Membership active
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      companyId,
      revokedAt: null,
      joinedAt: { not: null },
    },
    select: { id: true },
  });
  if (membership) return true;

  // 2. Fallback rétrocompat : User.companyId pour les users pas encore
  // backfillés (cas pendant la transition Phase 2).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId === companyId;
}

/**
 * Liste les companies accessibles par un user (toutes ses Memberships
 * actives + sa company historique en fallback).
 * Utile pour un futur workspace switcher (V2+). Pour l'instant : utilisé
 * en interne par requireAuth() pour résoudre la "company active".
 *
 * @returns Set d'ids de companies accessibles. Vide si user introuvable.
 */
export async function getAccessibleCompanyIds(
  userId: string
): Promise<Set<string>> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      revokedAt: null,
      joinedAt: { not: null },
    },
    select: { companyId: true },
  });
  const ids = new Set(memberships.map((m) => m.companyId));

  // Fallback rétrocompat
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (user?.companyId) ids.add(user.companyId);

  return ids;
}

/**
 * Résout la "company active" d'un user en V1 — où chaque user n'a qu'une
 * seule Membership. Stratégie :
 *   1. Membership active (la plus récente si plusieurs, ce qui ne devrait
 *      pas arriver en V1 mais on est défensif)
 *   2. Fallback User.companyId
 *
 * @returns companyId actif, ou null si aucun accès.
 */
export async function resolveActiveCompanyId(
  userId: string
): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      revokedAt: null,
      joinedAt: { not: null },
    },
    orderBy: { joinedAt: "desc" },
    select: { companyId: true },
  });
  if (membership) return membership.companyId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}
