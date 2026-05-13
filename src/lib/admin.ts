/**
 * src/lib/admin.ts — Whitelist d'accès aux pages /admin.
 *
 * Source de vérité : variable d'env ADMIN_EMAILS (séparée par virgules).
 * À déclarer dans .env.local ET dans Vercel (Production + Preview + Development).
 *
 * Non-whitelisté → notFound() côté serveur (pas 403, pour ne pas révéler
 * l'existence de la route admin).
 */

import { notFound } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const ADMIN_EMAILS = parseAdminEmails();

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Récupère l'email Clerk du signed-in user. Retourne null si déconnecté.
 * Utilise currentUser() (plus coûteux) — ne pas appeler dans un hot path.
 */
export async function getSignedInEmail(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const u = await currentUser();
  return u?.emailAddresses[0]?.emailAddress ?? null;
}

/**
 * À appeler en haut de chaque page/route admin. notFound() si :
 *   - pas signé in
 *   - email pas dans ADMIN_EMAILS
 *
 * On préfère notFound() à un 403 explicite pour ne pas révéler l'URL.
 */
export async function requireAdmin(): Promise<{ email: string; clerkUserId: string }> {
  const { userId } = await auth();
  if (!userId) notFound();
  const u = await currentUser();
  const email = u?.emailAddresses[0]?.emailAddress ?? null;
  if (!isAdminEmail(email)) notFound();
  return { email: email!, clerkUserId: userId };
}
