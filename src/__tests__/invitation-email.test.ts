/**
 * Tests des helpers pures du flow d'invitation (suite #69 — C2/4).
 *
 * On teste les 2 fonctions exportées qui ne dépendent ni de Resend ni
 * de Prisma : resolveInvitationRecipient (logique de redirect) et
 * buildInvitationEmailPayload (génération sujet + html).
 */

import {
  resolveInvitationRecipient,
  buildInvitationEmailPayload,
} from "../lib/email/invitation-template";

describe("resolveInvitationRecipient", () => {
  // Sauvegarde et restauration des env vars pour isoler chaque test
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.INVITATION_REDIRECT_EMAIL;
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  test("INVITATION_REDIRECT_EMAIL set → redirige avec actualTo = override", () => {
    process.env.INVITATION_REDIRECT_EMAIL = "test@example.com";
    const r = resolveInvitationRecipient("marie@caleson-prod.com");
    expect(r).toEqual({
      actualTo: "test@example.com",
      isRedirected: true,
      originalTo: "marie@caleson-prod.com",
    });
  });

  test("INVITATION_REDIRECT_EMAIL vide (whitespace) → ne pas redirect", () => {
    process.env.INVITATION_REDIRECT_EMAIL = "   ";
    const r = resolveInvitationRecipient("marie@caleson-prod.com");
    // En dev (NODE_ENV !== production en jest), DEV_TO catch-all
    // s'applique → isRedirected:true mais vers DEV_TO, pas override
    expect(r.isRedirected).toBe(true);
    expect(r.actualTo).not.toBe("marie@caleson-prod.com");
  });

  test("originalTo est toujours préservé pour traçabilité", () => {
    process.env.INVITATION_REDIRECT_EMAIL = "rose@example.com";
    const r = resolveInvitationRecipient("marie@caleson-prod.com");
    expect(r.originalTo).toBe("marie@caleson-prod.com");
  });
});

describe("buildInvitationEmailPayload", () => {
  const base = {
    to: "marie@caleson-prod.com",
    inviterName: "Vanda",
    companyName: "Caleson",
    acceptUrl: "https://prodbill.fr/invitations/accept?token=abc",
    expiresAt: new Date("2026-05-28T00:00:00Z"),
  };

  test("Sujet normal sans préfixe quand pas redirigé", () => {
    const { subject } = buildInvitationEmailPayload(base, {
      actualTo: "marie@caleson-prod.com",
      isRedirected: false,
      originalTo: "marie@caleson-prod.com",
    });
    expect(subject).toBe("Invitation à rejoindre Caleson sur ProdBill");
    expect(subject).not.toMatch(/REDIRECT/);
  });

  test("Sujet préfixé [REDIRECT — DEST ORIGINAL: …] quand redirigé", () => {
    const { subject } = buildInvitationEmailPayload(base, {
      actualTo: "rose@example.com",
      isRedirected: true,
      originalTo: "marie@caleson-prod.com",
    });
    expect(subject).toMatch(/^\[REDIRECT — DEST ORIGINAL: marie@caleson-prod\.com\]/);
    expect(subject).toContain("Caleson");
  });

  test("HTML contient le bouton CTA avec l'URL d'acceptation", () => {
    const { html } = buildInvitationEmailPayload(base, {
      actualTo: "marie@caleson-prod.com",
      isRedirected: false,
      originalTo: "marie@caleson-prod.com",
    });
    expect(html).toContain("https://prodbill.fr/invitations/accept?token=abc");
    expect(html).toContain("Accepter l'invitation");
  });

  test("HTML contient la bannière redirect quand redirigé", () => {
    const { html } = buildInvitationEmailPayload(base, {
      actualTo: "rose@example.com",
      isRedirected: true,
      originalTo: "marie@caleson-prod.com",
    });
    expect(html).toMatch(/Mail redirig/);
    expect(html).toContain("marie@caleson-prod.com");
  });

  test("HTML ne contient PAS la bannière redirect quand pas redirigé", () => {
    const { html } = buildInvitationEmailPayload(base, {
      actualTo: "marie@caleson-prod.com",
      isRedirected: false,
      originalTo: "marie@caleson-prod.com",
    });
    expect(html).not.toMatch(/Mail redirig/);
  });

  test("HTML mentionne l'inviteur et la société", () => {
    const { html } = buildInvitationEmailPayload(base, {
      actualTo: "marie@caleson-prod.com",
      isRedirected: false,
      originalTo: "marie@caleson-prod.com",
    });
    expect(html).toContain("Vanda");
    expect(html).toContain("Caleson");
  });

  test("HTML mentionne la date d'expiration en français", () => {
    const { html } = buildInvitationEmailPayload(base, {
      actualTo: "marie@caleson-prod.com",
      isRedirected: false,
      originalTo: "marie@caleson-prod.com",
    });
    // fmtDate produit "28 mai 2026" en fr-FR
    expect(html).toMatch(/28 mai 2026/);
  });

  test("accentColor custom est appliquée au header et au bouton", () => {
    const { html } = buildInvitationEmailPayload(
      { ...base, accentColor: "#ff0000" },
      {
        actualTo: "marie@caleson-prod.com",
        isRedirected: false,
        originalTo: "marie@caleson-prod.com",
      }
    );
    expect(html).toContain("#ff0000");
  });
});
