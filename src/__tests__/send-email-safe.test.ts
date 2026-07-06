/**
 * Tests du wrapper sendEmailSafe (C-MAIL-KILL-SWITCH).
 *
 * Deux comportements couverts :
 *   1. MAIL_KILL_SWITCH === "true" → skipped, resend.emails.send() JAMAIS appelé.
 *   2. MAIL_KILL_SWITCH absent/autre → envoi réel, statut Resend vérifié
 *      (leçon 26/05 : { error } non-null doit lever).
 *
 * Le SDK Resend est mocké pour ne dépendre d'aucune clé API.
 */

// Mock du package "resend" : on capture les appels à emails.send.
const sendMock = jest.fn();
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

import { sendEmailSafe } from "../lib/email/sendEmailSafe";

const baseParams = {
  type: "TEST",
  to: "client@example.com",
  from: "ProdBill <noreply@prodbill.fr>",
  subject: "Sujet test",
  html: "<p>hello</p>",
};

describe("sendEmailSafe — kill switch", () => {
  const originalEnv = { ...process.env };
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
    delete process.env.MAIL_KILL_SWITCH;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  test('MAIL_KILL_SWITCH="true" → skipped et aucun envoi Resend', async () => {
    process.env.MAIL_KILL_SWITCH = "true";

    const res = await sendEmailSafe(baseParams);

    expect(res).toEqual({
      sent: false,
      skipped: true,
      reason: "MAIL_KILL_SWITCH",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test("MAIL_KILL_SWITCH absent → envoi réel effectué", async () => {
    const res = await sendEmailSafe(baseParams);

    expect(res).toEqual({ sent: true, skipped: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      to: "client@example.com",
      from: "ProdBill <noreply@prodbill.fr>",
      subject: "Sujet test",
    });
  });

  test('MAIL_KILL_SWITCH="false" (valeur ≠ "true") → envoi réel', async () => {
    process.env.MAIL_KILL_SWITCH = "false";
    const res = await sendEmailSafe(baseParams);
    expect(res.sent).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("Resend renvoie { error } → lève (leçon 26/05)", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "invalid to" },
    });
    await expect(sendEmailSafe(baseParams)).rejects.toThrow(/Resend a rejeté/);
  });

  test("attachments transmis quand présents", async () => {
    await sendEmailSafe({
      ...baseParams,
      attachments: [{ filename: "f.pdf", content: Buffer.from("x") }],
    });
    expect(sendMock.mock.calls[0][0].attachments).toHaveLength(1);
  });
});
