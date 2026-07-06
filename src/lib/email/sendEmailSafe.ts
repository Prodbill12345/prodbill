/**
 * src/lib/email/sendEmailSafe.ts
 *
 * WRAPPER UNIQUE ET OBLIGATOIRE pour TOUT envoi d'email Resend dans ProdBill.
 * Aucune fonction ne doit appeler `resend.emails.send()` directement — tout
 * passe par ici. C'est le seul point de vérité pour :
 *
 *   1. LE KILL SWITCH GLOBAL — `MAIL_KILL_SWITCH`.
 *      Si la variable d'env vaut exactement "true", AUCUN mail ne part :
 *      early return { sent:false, skipped:true, reason:"MAIL_KILL_SWITCH" }
 *      + un console.warn côté serveur (audit trail : type + destinataire prévu).
 *      Activé dans Vercel prod pendant que Vanda saisit son historique en
 *      manuel — garantit qu'aucun mail parasite ne parte à un vrai client.
 *      Pour réactiver les mails : retirer la variable (ou la passer à != "true").
 *
 *   2. LA VÉRIFICATION DU STATUT RESEND (leçon 26/05).
 *      resend.emails.send() NE throw PAS sur erreur API : il renvoie
 *      { data, error }. On lève explicitement si `error` est présent, sinon
 *      les échecs d'envoi passent inaperçus.
 *
 * Tout nouvel email (ex : T3 #91 à venir) DOIT passer par sendEmailSafe pour
 * hériter automatiquement du kill switch — impossible d'oublier un endpoint.
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailSafeParams {
  /** Libellé du type d'email, pour le log d'audit (ex: "DEVIS", "FACTURE_EMISE",
   *  "RELANCE_1", "INVITATION"). N'affecte pas l'envoi. */
  type: string;
  /** Destinataire réel (déjà résolu : catch-all dev / redirect éventuel). */
  to: string;
  from: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export interface SendEmailSafeResult {
  sent: boolean;
  skipped: boolean;
  reason?: string;
}

export async function sendEmailSafe(
  params: SendEmailSafeParams
): Promise<SendEmailSafeResult> {
  const { type, to, from, subject, html, attachments } = params;

  // ── Kill switch global ────────────────────────────────────────────────
  if (process.env.MAIL_KILL_SWITCH === "true") {
    console.warn(
      `[MAIL_KILL_SWITCH] Email NON envoyé (kill switch actif). ` +
        `type=${type} to=${to} subject=${JSON.stringify(subject)}`
    );
    return { sent: false, skipped: true, reason: "MAIL_KILL_SWITCH" };
  }

  // ── Envoi réel ────────────────────────────────────────────────────────
  const { error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });

  if (error) {
    // Leçon 26/05 : surface l'erreur au lieu de la laisser silencieuse.
    throw new Error(
      `[sendEmailSafe] Resend a rejeté l'envoi (type=${type}, to=${to}) : ${JSON.stringify(error)}`
    );
  }

  return { sent: true, skipped: false };
}
