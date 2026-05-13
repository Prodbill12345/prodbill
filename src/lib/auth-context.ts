/**
 * src/lib/auth-context.ts — Résolution de l'utilisateur effectif.
 *
 * Phase 1 : pattern standard SSR dashboard = `auth() + prisma.user.findUnique`.
 * Avec l'impersonation, le user "effectif" peut être différent de celui de
 * la session Clerk : si l'admin a démarré une session d'impersonation, on
 * retourne le user cible (et tous les scopedPrisma() s'alignent dessus).
 *
 * `getCurrentUser()` : remplace findUnique({where:{clerkId}}) dans les pages.
 * `getActor()`       : renvoie aussi le user réel et un flag isImpersonating
 *                      (pour le banner et le title HTML).
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import type { User } from "@prisma/client";

export const IMPERSONATE_COOKIE = "prodbill_impersonate";

export interface ImpersonationPayload {
  realClerkId: string;
  realEmail: string;
  impersonatedUserId: string;
  impersonatedCompanyId: string;
  startedAt: number;
}

function readImpersonationCookieRaw(value: string | undefined): ImpersonationPayload | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ImpersonationPayload;
    if (
      typeof parsed.realClerkId === "string" &&
      typeof parsed.realEmail === "string" &&
      typeof parsed.impersonatedUserId === "string" &&
      typeof parsed.impersonatedCompanyId === "string"
    ) {
      return parsed;
    }
  } catch {
    /* corrompu, ignore */
  }
  return null;
}

async function resolveImpersonatedUser(payload: ImpersonationPayload): Promise<User | null> {
  // Defense in depth : on revalide que la session Clerk active est bien
  // l'admin référencé par le cookie ET que cet email est toujours whitelisté.
  const { userId } = await auth();
  if (!userId || userId !== payload.realClerkId) return null;
  const u = await currentUser();
  const email = u?.emailAddresses[0]?.emailAddress;
  if (!isAdminEmail(email)) return null;

  const target = await prisma.user.findUnique({
    where: { id: payload.impersonatedUserId },
  });
  if (!target) return null;
  if (target.companyId !== payload.impersonatedCompanyId) return null;
  return target;
}

/**
 * Retourne l'utilisateur effectif (impersonated si en mode admin, sinon réel).
 * Null si non signé in OU si le user réel n'a pas de row Prisma (cas onboarding).
 *
 * À utiliser dans toutes les SSR pages du dashboard :
 *   const user = await getCurrentUser();
 *   if (!user) return null;
 *   const db = scopedPrisma(user.companyId);
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const cookieStore = await cookies();
  const payload = readImpersonationCookieRaw(cookieStore.get(IMPERSONATE_COOKIE)?.value);
  if (payload) {
    const target = await resolveImpersonatedUser(payload);
    if (target) return target;
  }

  return prisma.user.findUnique({ where: { clerkId } });
}

export interface Actor {
  user: User | null;             // utilisateur effectif (impersonated ou réel)
  realUser: User | null;         // utilisateur réel (toujours celui de la session Clerk)
  realEmail: string | null;      // email Clerk
  isImpersonating: boolean;
  impersonationStartedAt: number | null;
}

/**
 * Variante de getCurrentUser() qui retourne aussi le contexte impersonation.
 * À utiliser dans :
 *   - (dashboard)/layout.tsx (banner + title prefix)
 *   - /admin pages (vérifier l'identité réelle)
 *   - API routes sensibles
 */
export async function getActor(): Promise<Actor> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return {
      user: null,
      realUser: null,
      realEmail: null,
      isImpersonating: false,
      impersonationStartedAt: null,
    };
  }

  const u = await currentUser();
  const realEmail = u?.emailAddresses[0]?.emailAddress ?? null;
  const realUser = await prisma.user.findUnique({ where: { clerkId } });

  const cookieStore = await cookies();
  const payload = readImpersonationCookieRaw(cookieStore.get(IMPERSONATE_COOKIE)?.value);
  if (payload && isAdminEmail(realEmail) && payload.realClerkId === clerkId) {
    const target = await prisma.user.findUnique({
      where: { id: payload.impersonatedUserId },
    });
    if (target && target.companyId === payload.impersonatedCompanyId) {
      return {
        user: target,
        realUser,
        realEmail,
        isImpersonating: true,
        impersonationStartedAt: payload.startedAt,
      };
    }
  }

  return {
    user: realUser,
    realUser,
    realEmail,
    isImpersonating: false,
    impersonationStartedAt: null,
  };
}
