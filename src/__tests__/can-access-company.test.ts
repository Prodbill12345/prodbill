/**
 * Tests pour le helper canAccessCompany (Phase 2 multi-user).
 *
 * Stratégie : on mock @/lib/prisma pour isoler la logique d'authz.
 * Les tests vérifient les 3 chemins possibles :
 *   1. Membership active existe → accès accordé
 *   2. Pas de Membership, mais User.companyId match → accès accordé (rétrocompat)
 *   3. Ni Membership ni User.companyId match → accès refusé
 *
 * On teste aussi resolveActiveCompanyId() qui suit la même logique.
 */

import { canAccessCompany, resolveActiveCompanyId } from "../lib/auth/can-access-company";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Récupère le mock typé pour réutilisation dans les tests
import { prisma } from "@/lib/prisma";
const mockMembershipFindFirst = prisma.membership.findFirst as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;

beforeEach(() => {
  mockMembershipFindFirst.mockReset();
  mockUserFindUnique.mockReset();
});

describe("canAccessCompany", () => {
  test("Membership active existe → true (sans regarder User.companyId)", async () => {
    mockMembershipFindFirst.mockResolvedValue({ id: "mem-1" });
    // User.findUnique ne doit pas être appelé puisque la Membership match
    mockUserFindUnique.mockResolvedValue(null);

    const result = await canAccessCompany("user-1", "company-A");

    expect(result).toBe(true);
    expect(mockMembershipFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        companyId: "company-A",
        revokedAt: null,
        joinedAt: { not: null },
      },
      select: { id: true },
    });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  test("Pas de Membership, User.companyId match → true (fallback rétrocompat)", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ companyId: "company-A" });

    const result = await canAccessCompany("user-1", "company-A");

    expect(result).toBe(true);
  });

  test("Pas de Membership, User.companyId différent → false", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ companyId: "company-B" });

    const result = await canAccessCompany("user-1", "company-A");

    expect(result).toBe(false);
  });

  test("Pas de Membership, user introuvable → false", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);

    const result = await canAccessCompany("user-orphan", "company-A");

    expect(result).toBe(false);
  });

  test("Membership révoquée (revokedAt non null) n'est pas retournée par la query → fallback testé", async () => {
    // Simule : la query filtre `revokedAt: null` → ne ramène rien si révoquée.
    // Le mock retourne null (comportement de Prisma) → fallback User.companyId.
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ companyId: "company-other" });

    const result = await canAccessCompany("user-revoked", "company-A");

    expect(result).toBe(false);
    // Vérifie qu'on a bien tenté de filtrer les révoquées dans la query
    expect(mockMembershipFindFirst.mock.calls[0][0].where.revokedAt).toBe(null);
  });

  test("Invitation pending (joinedAt null) → la query filtre → fallback testé", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ companyId: "company-other" });

    const result = await canAccessCompany("user-pending", "company-A");

    expect(result).toBe(false);
    // joinedAt: { not: null } doit être dans la query
    expect(mockMembershipFindFirst.mock.calls[0][0].where.joinedAt).toEqual({
      not: null,
    });
  });
});

describe("resolveActiveCompanyId", () => {
  test("Membership active → retourne son companyId", async () => {
    mockMembershipFindFirst.mockResolvedValue({ companyId: "company-A" });

    const result = await resolveActiveCompanyId("user-1");

    expect(result).toBe("company-A");
  });

  test("Pas de Membership → fallback User.companyId", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ companyId: "company-legacy" });

    const result = await resolveActiveCompanyId("user-1");

    expect(result).toBe("company-legacy");
  });

  test("Ni Membership ni user → null", async () => {
    mockMembershipFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue(null);

    const result = await resolveActiveCompanyId("user-ghost");

    expect(result).toBeNull();
  });
});
