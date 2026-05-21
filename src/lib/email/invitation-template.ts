/**
 * src/lib/email/invitation-template.ts
 *
 * Helpers PURS (sans dépendance Resend) pour construire un mail
 * d'invitation Phase 2 (suite #69) :
 *   - resolveInvitationRecipient : décide à qui le mail va vraiment
 *     (gère INVITATION_REDIRECT_EMAIL + fallback dev catch-all)
 *   - buildInvitationEmailPayload : génère { subject, html }
 *
 * Séparé de resend.ts pour permettre les tests sans clé Resend.
 *
 * Garde-fou Rose : variable INVITATION_REDIRECT_EMAIL.
 * Si set (même en prod), tous les mails d'invitation sont redirigés vers
 * cette adresse avec un préfixe sujet + encadré "Mail redirigé pour test"
 * — utile pour tester le flow self-invite sans spammer Marie/Vanda.
 */

const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_TO = "roselaine.touati@live.fr";

export interface InvitationEmailParams {
  /** Destinataire ORIGINAL de l'invitation (peut être redirigé via env var). */
  to: string;
  /** Nom de la personne qui invite (affiché dans le mail). */
  inviterName: string;
  /** Nom de la société d'accueil. */
  companyName: string;
  /** Lien complet d'acceptation, ex: https://prodbill.fr/invitations/accept?token=XXX */
  acceptUrl: string;
  /** Date d'expiration du token (créée + 7j typiquement). */
  expiresAt: Date;
  /** Couleur d'accentuation de la société (header email). Défaut bleu. */
  accentColor?: string;
}

export interface InvitationRecipient {
  actualTo: string;
  isRedirected: boolean;
  originalTo: string;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Décide à qui le mail va réellement être envoyé. Priorité :
 *   1. INVITATION_REDIRECT_EMAIL set → on redirige TOUT (même en prod)
 *   2. Sinon, IS_DEV → DEV_TO (catch-all dev existant)
 *   3. Sinon → vraie adresse
 */
export function resolveInvitationRecipient(originalTo: string): InvitationRecipient {
  const override = process.env.INVITATION_REDIRECT_EMAIL?.trim();
  if (override) {
    return { actualTo: override, isRedirected: true, originalTo };
  }
  if (IS_DEV) {
    return { actualTo: DEV_TO, isRedirected: true, originalTo };
  }
  return { actualTo: originalTo, isRedirected: false, originalTo };
}

function emailWrapper(companyName: string, accentColor: string, body: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f1f5f9;">
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <div style="background:${accentColor};padding:18px 32px;">
        <span style="color:#fff;font-weight:700;font-size:15px;">${companyName}</span>
      </div>
      <div style="padding:32px;">
        ${body}
      </div>
    </div>
  </body></html>`;
}

/**
 * Construit le sujet + corps HTML d'un mail d'invitation.
 */
export function buildInvitationEmailPayload(
  params: InvitationEmailParams,
  recipient: InvitationRecipient
): { subject: string; html: string } {
  const accent = params.accentColor ?? "#3b82f6";

  const baseSubject = `Invitation à rejoindre ${params.companyName} sur ProdBill`;
  const subject = recipient.isRedirected
    ? `[REDIRECT — DEST ORIGINAL: ${recipient.originalTo}] ${baseSubject}`
    : baseSubject;

  const redirectBanner = recipient.isRedirected
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#78350f;">
         ⚠️ <strong>Mail redirigé pour test.</strong> Destinataire original : <code>${recipient.originalTo}</code>
       </div>`
    : "";

  const html = emailWrapper(params.companyName, accent, `
    ${redirectBanner}
    <h2 style="font-size:20px;color:#1e293b;margin:0 0 16px;">
      ${params.inviterName} vous invite à rejoindre <strong>${params.companyName}</strong>
    </h2>
    <p style="color:#475569;line-height:1.7;">
      Vous avez été invité à collaborer sur le workspace ProdBill de
      <strong>${params.companyName}</strong>. Cliquez sur le bouton ci-dessous
      pour accepter l'invitation et créer (ou utiliser) votre compte.
    </p>
    <div style="margin:28px 0;">
      <a href="${params.acceptUrl}" style="display:inline-block;background:${accent};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
        Accepter l'invitation
      </a>
    </div>
    <p style="color:#64748b;font-size:13px;line-height:1.6;">
      Ce lien expire le <strong>${fmtDate(params.expiresAt)}</strong>.<br/>
      Si vous n'attendiez pas cette invitation, ignorez simplement ce message.
    </p>
    <p style="color:#94a3b8;font-size:12px;margin-top:24px;word-break:break-all;">
      Lien direct : ${params.acceptUrl}
    </p>
  `);
  return { subject, html };
}
