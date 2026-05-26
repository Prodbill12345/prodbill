/**
 * Tests des helpers pures `pendingInvitationsWhere` et
 * `checkInvitationAcceptable`. Couvre le bug fix : GET ne doit
 * retourner que les pending (non acceptées + non révoquées + non
 * expirées) et accept doit refuser proprement les 3 états.
 */

import {
  pendingInvitationsWhere,
  checkInvitationAcceptable,
} from "../lib/invitations";

describe("pendingInvitationsWhere", () => {
  test("filtre les 3 conditions PENDING + le companyId", () => {
    const now = new Date("2026-05-26T12:00:00Z");
    const where = pendingInvitationsWhere("company-A", now);

    expect(where).toEqual({
      companyId: "company-A",
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    });
  });

  test("utilise new Date() par défaut si now non fourni", () => {
    const where = pendingInvitationsWhere("company-A");
    expect((where.expiresAt as { gt: Date }).gt).toBeInstanceOf(Date);
  });

  test("scope strictement par companyId — une autre company ne fuite pas", () => {
    const a = pendingInvitationsWhere("company-A");
    const b = pendingInvitationsWhere("company-B");
    expect(a.companyId).toBe("company-A");
    expect(b.companyId).toBe("company-B");
  });
});

describe("checkInvitationAcceptable", () => {
  const now = new Date("2026-05-26T12:00:00Z");
  const future = new Date("2026-06-02T12:00:00Z"); // now + 7j
  const past = new Date("2026-05-19T12:00:00Z"); // now - 7j

  test("invitation pending valide → ok:true", () => {
    const r = checkInvitationAcceptable(
      { acceptedAt: null, revokedAt: null, expiresAt: future },
      now
    );
    expect(r).toEqual({ ok: true });
  });

  test("invitation déjà acceptée → 409 Conflict", () => {
    const r = checkInvitationAcceptable(
      { acceptedAt: new Date("2026-05-20"), revokedAt: null, expiresAt: future },
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.message).toMatch(/déjà été acceptée/i);
    }
  });

  test("invitation révoquée → 410 Gone", () => {
    const r = checkInvitationAcceptable(
      { acceptedAt: null, revokedAt: new Date("2026-05-24"), expiresAt: future },
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(410);
      expect(r.message).toMatch(/annul/i);
    }
  });

  test("invitation expirée → 410 Gone", () => {
    const r = checkInvitationAcceptable(
      { acceptedAt: null, revokedAt: null, expiresAt: past },
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(410);
      expect(r.message).toMatch(/expir/i);
    }
  });

  test("priorité : déjà acceptée prime sur révoquée (cas pathologique)", () => {
    // Cas théorique impossible en pratique (les 2 flags exclusifs) mais
    // on documente le comportement : accepted gagne.
    const r = checkInvitationAcceptable(
      {
        acceptedAt: new Date("2026-05-20"),
        revokedAt: new Date("2026-05-21"),
        expiresAt: future,
      },
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
  });

  test("expiresAt = now (limite exacte) → considéré non-expiré", () => {
    // expiresAt < now → expirée. Donc expiresAt === now → encore valide.
    const r = checkInvitationAcceptable(
      { acceptedAt: null, revokedAt: null, expiresAt: now },
      now
    );
    expect(r).toEqual({ ok: true });
  });
});
