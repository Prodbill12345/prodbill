/**
 * scoped-prisma.ts — Garde-fou multi-tenant Phase 1.
 *
 * Utilisation :
 *   const db = scopedPrisma(user.companyId);
 *   await db.devis.findMany({ where: { statut: "ACCEPTE" } });
 *     // → where.companyId injecté automatiquement
 *
 * Le helper applique 4 protections :
 *   1. Injection automatique de companyId dans where (lectures/updates/deletes)
 *      et dans data (créations) sur tous les SCOPED_MODELS.
 *   2. findUnique({ where: { id } }) → réécrit en findFirst({ where: { id, companyId } })
 *      car Prisma interdit les colonnes additionnelles dans findUnique by PK.
 *   3. findUnique({ where: { numero } }) sur Facture/BDC → réécrit avec la
 *      clé unique composée companyId_numero (garde l'index unique en place).
 *   4. Validation pré-query des FK : si data.clientId / devisId / factureId /
 *      comedienId / agentId / sectionId / budgetId pointe vers une ressource
 *      d'un autre tenant → throw CrossTenantError avant l'exécution.
 *
 * ⚠️ NESTED WRITES : l'extension ne descend PAS automatiquement dans les
 * { create: { lignes: { create: [...] } } } imbriqués. Utiliser les helpers
 * scopedSection / scopedLigne / scopedBudgetLigne / scopedPaiement ci-dessous
 * qui injectent companyId dans la data. Sinon Prisma lèvera une erreur de
 * contrainte NOT NULL.
 *
 * ⚠️ RAW QUERIES : $queryRaw et $executeRaw ne sont PAS interceptés. À
 * vérifier manuellement (rare dans le code applicatif, surtout pour les
 * scripts d'admin).
 */

import { prisma } from "@/lib/prisma";

export class CrossTenantError extends Error {
  constructor(field: string, id: string) {
    super(
      `Tentative d'accès cross-tenant interdite : ${field}=${id} n'appartient pas au workspace actif.`
    );
    this.name = "CrossTenantError";
  }
}

// Modèles dont les rows portent un companyId direct. Hors scope :
//   - User : Phase 1 garde la relation 1-N ; Phase 2 → table Membership
//   - Company : tenant lui-même
const SCOPED_MODELS = new Set([
  "Client",
  "Comedien",
  "Agent",
  "Devis",
  "Facture",
  "DevisSection",
  "DevisLigne",
  "BDC",
  "Paiement",
  "BudgetPrevisionnel",
  "BudgetLigne",
  "Relance",
  "Counter",
  "AuditLog",
  "Document",
  "DevisTemplate",
]);

// Modèles avec unicité composée (companyId, numero).
const COMPOSITE_NUMERO_MODELS = new Set(["Facture", "BDC"]);

// FK directes vers des modèles scopés — à valider avant chaque create/update.
// Si data.<key> est présent, on vérifie que la row pointée appartient au tenant.
const FK_TO_MODEL: Record<string, string> = {
  clientId: "Client",
  devisId: "Devis",
  factureId: "Facture",
  comedienId: "Comedien",
  agentId: "Agent",
  sectionId: "DevisSection",
  budgetId: "BudgetPrevisionnel",
};

/**
 * Valide qu'une row pointée par une FK appartient au tenant actif.
 * Throw CrossTenantError sinon.
 */
async function validateFkOwnership(
  field: string,
  id: string,
  companyId: string
): Promise<void> {
  const modelName = FK_TO_MODEL[field];
  if (!modelName) return;
  const camel = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  // @ts-expect-error — dynamic model access
  const row = await prisma[camel].findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!row) return; // l'absence sera gérée par Prisma (P2025 Foreign key)
  if (row.companyId !== companyId) {
    throw new CrossTenantError(field, id);
  }
}

/**
 * Scanne args.data pour les FK directes et valide leur appartenance.
 * Inspecte aussi les { connect: { id } } imbriqués au premier niveau.
 */
async function validateAllFks(
  data: Record<string, unknown> | undefined,
  companyId: string
): Promise<void> {
  if (!data || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data)) {
    if (FK_TO_MODEL[key] && typeof value === "string") {
      await validateFkOwnership(key, value, companyId);
    }
    // Pattern Prisma { relationName: { connect: { id: "..." } } }
    if (
      value &&
      typeof value === "object" &&
      "connect" in value &&
      (value as Record<string, unknown>).connect
    ) {
      const conn = (value as { connect: unknown }).connect as
        | { id?: string }
        | { id?: string }[];
      const ids = Array.isArray(conn) ? conn : [conn];
      for (const c of ids) {
        if (c?.id) {
          // On déduit le modèle cible depuis la convention de nommage : la
          // relation s'appelle souvent comme le modèle en camelCase. On
          // teste les FK_TO_MODEL inversés.
          const matchedField = Object.keys(FK_TO_MODEL).find(
            (fk) =>
              fk.replace(/Id$/, "").toLowerCase() ===
              key.toLowerCase()
          );
          if (matchedField) {
            await validateFkOwnership(matchedField, c.id, companyId);
          }
        }
      }
    }
  }
}

/**
 * Crée un client Prisma "scopé" pour un tenant donné. À appeler à chaque
 * requête HTTP — NE PAS conserver en singleton de module (fuite entre requêtes
 * concurrentes).
 */
export function scopedPrisma(companyId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SCOPED_MODELS.has(model)) {
            return query(args);
          }

          // Cast en any pour manipulation des args polymorphes selon op.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = args as any;

          // ─── Lectures / count / aggregate / groupBy ────────────────
          if (
            operation === "findMany" ||
            operation === "findFirst" ||
            operation === "count" ||
            operation === "aggregate" ||
            operation === "groupBy"
          ) {
            a.where = { ...(a.where ?? {}), companyId };
            return query(a);
          }

          // ─── findUnique : 2 cas spéciaux ───────────────────────────
          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            const w = a.where ?? {};
            // Cas A : where = { id: "..." } → on convertit en findFirst
            // (Prisma rejette les colonnes additionnelles sur findUnique by PK)
            if (w.id && !w.companyId_numero) {
              const fallback = operation === "findUniqueOrThrow" ? "findFirstOrThrow" : "findFirst";
              a.where = { ...w, companyId };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)][fallback](a);
            }
            // Cas B : where = { numero: "..." } sur Facture/BDC
            // → on réécrit avec la clé unique composée (préserve l'index)
            if (
              w.numero &&
              !w.companyId_numero &&
              COMPOSITE_NUMERO_MODELS.has(model)
            ) {
              a.where = { companyId_numero: { companyId, numero: w.numero } };
              return query(a);
            }
            // Sinon : appliquer le scope si possible
            a.where = { ...w, companyId };
            return query(a);
          }

          // ─── Créations : injecte companyId + valide FK ─────────────
          if (operation === "create") {
            await validateAllFks(a.data, companyId);
            a.data = { ...a.data, companyId };
            return query(a);
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const items = Array.isArray(a.data) ? a.data : [a.data];
            for (const it of items) await validateAllFks(it, companyId);
            a.data = items.map((d: Record<string, unknown>) => ({ ...d, companyId }));
            return query(a);
          }

          // ─── update / delete : scope via where + valide FK changée ─
          if (operation === "update" || operation === "delete") {
            a.where = { ...(a.where ?? {}), companyId };
            if (operation === "update" && a.data) {
              await validateAllFks(a.data, companyId);
            }
            return query(a);
          }
          if (operation === "updateMany" || operation === "deleteMany") {
            a.where = { ...(a.where ?? {}), companyId };
            if (operation === "updateMany" && a.data) {
              await validateAllFks(a.data, companyId);
            }
            return query(a);
          }

          // ─── upsert : scope create.data + update.data + where ─────
          if (operation === "upsert") {
            a.where = { ...(a.where ?? {}), companyId };
            if (a.create) {
              await validateAllFks(a.create, companyId);
              a.create = { ...a.create, companyId };
            }
            if (a.update) {
              await validateAllFks(a.update, companyId);
            }
            return query(a);
          }

          return query(args);
        },
      },
    },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Helpers pour les nested writes — l'extension ne descend pas dans les
// { create: { ... } } imbriqués. À utiliser systématiquement.
// ──────────────────────────────────────────────────────────────────────

export function scopedSection<T extends object>(
  companyId: string,
  data: T
): T & { companyId: string } {
  return { ...data, companyId };
}

export function scopedLigne<T extends object>(
  companyId: string,
  data: T
): T & { companyId: string } {
  return { ...data, companyId };
}

export function scopedBudgetLigne<T extends object>(
  companyId: string,
  data: T
): T & { companyId: string } {
  return { ...data, companyId };
}

export function scopedPaiement<T extends object>(
  companyId: string,
  data: T
): T & { companyId: string } {
  return { ...data, companyId };
}
