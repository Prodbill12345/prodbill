import { Resend } from "resend";
import type { RelanceType } from "@prisma/client";

export const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Sandbox dev ────────────────────────────────────────────────────────────
// En développement (sans domaine vérifié), Resend impose l'expéditeur
// onboarding@resend.dev et bloque toute autre adresse from.
// On redirige aussi tous les emails vers l'adresse de test.

const IS_DEV = process.env.NODE_ENV !== "production";
const DEV_FROM = "onboarding@resend.dev";
const DEV_TO = "roselaine.touati@live.fr";

function resolveFrom(companyName: string): string {
  return IS_DEV ? DEV_FROM : `${companyName} <noreply@prodbill.fr>`;
}

function resolveTo(to: string): string {
  return IS_DEV ? DEV_TO : to;
}

// ─── Helpers communs ────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function bankTable(iban: string, bic: string) {
  return `
    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">IBAN</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-family:monospace;font-size:13px;">${iban}</td>
      </tr>
      <tr>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#64748b;">BIC / SWIFT</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0;font-family:monospace;font-size:13px;">${bic}</td>
      </tr>
    </table>`;
}

function emailWrapper(companyName: string, accentColor: string, body: string) {
  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:0;background:#f1f5f9;">
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <div style="background:${accentColor};padding:18px 32px;">
        <span style="color:#fff;font-weight:700;font-size:15px;">${companyName}</span>
      </div>
      <div style="padding:32px;">
        ${body}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />
        <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin:0;">
          Pénalités de retard : 15 % par an, exigibles à 45 jours.<br />
          Indemnité forfaitaire de recouvrement : 40 € (art. D.441-5 C. com.).
        </p>
      </div>
    </div>
  </body></html>`;
}

// ─── Paramètres communs relances ────────────────────────────────────────────

export interface RelanceEmailParams {
  to: string;
  clientName: string;
  companyName: string;
  factureNumero: string;
  totalTtc: number;
  dateEcheance: Date;
  joursRetard: number;
  penalites: number;
  iban: string;
  bic: string;
  pdfBuffer: Buffer; // PDF joint en pièce attachée
  accentColor?: string;
  premierRelanceDate?: Date; // pour RELANCE_2 : date de la 1ère relance
}

// ─── Templates ──────────────────────────────────────────────────────────────

function templateEnvoi(p: RelanceEmailParams) {
  const subject = `Facture ${p.factureNumero} — ${fmt(p.totalTtc)}`;
  const html = emailWrapper(p.companyName, p.accentColor ?? "#3b82f6", `
    <h2 style="font-size:20px;color:#1e293b;margin:0 0 16px;">Bonjour ${p.clientName},</h2>
    <p style="color:#475569;line-height:1.7;">
      Veuillez trouver ci-joint la facture <strong>${p.factureNumero}</strong>
      d'un montant de <strong>${fmt(p.totalTtc)} TTC</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;margin:20px 0;">
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:13px;">Référence</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:600;">${p.factureNumero}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:13px;">Montant TTC</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:700;font-size:15px;">${fmt(p.totalTtc)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;color:#64748b;font-size:13px;">Date d'échéance</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;color:#dc2626;font-weight:600;">${fmtDate(p.dateEcheance)}</td>
      </tr>
    </table>
    <p style="color:#475569;line-height:1.7;font-size:13px;">Coordonnées bancaires pour le règlement :</p>
    ${bankTable(p.iban, p.bic)}
    <p style="color:#64748b;font-size:13px;">Cordialement,<br/><strong>${p.companyName}</strong></p>
  `);
  return { subject, html };
}

function templateRelance1(p: RelanceEmailParams) {
  const subject = `[Rappel] Facture ${p.factureNumero} — Règlement en attente`;
  const html = emailWrapper(p.companyName, p.accentColor ?? "#3b82f6", `
    <h2 style="font-size:20px;color:#1e293b;margin:0 0 16px;">Bonjour ${p.clientName},</h2>
    <p style="color:#475569;line-height:1.7;">
      Sauf erreur ou omission de notre part, il semblerait que la facture
      <strong>${p.factureNumero}</strong> d'un montant de <strong>${fmt(p.totalTtc)} TTC</strong>,
      dont la date d'échéance était le <strong>${fmtDate(p.dateEcheance)}</strong>,
      n'ait pas encore été réglée à ce jour.
    </p>
    <p style="color:#475569;line-height:1.7;">
      Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.
      Si vous avez déjà effectué ce paiement, veuillez ignorer ce message.
    </p>
    ${bankTable(p.iban, p.bic)}
    <p style="color:#64748b;font-size:13px;">
      En cas de difficulté, n'hésitez pas à nous contacter afin de trouver ensemble une solution.<br/><br/>
      Cordialement,<br/><strong>${p.companyName}</strong>
    </p>
  `);
  return { subject, html };
}

function templateRelance2(p: RelanceEmailParams) {
  const subject = `[2ème relance] Facture ${p.factureNumero} — ${p.joursRetard} jours de retard`;
  const html = emailWrapper(p.companyName, "#f59e0b", `
    <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
      <strong style="color:#92400e;">Deuxième relance — Facture impayée depuis ${p.joursRetard} jours</strong>
    </div>
    <h2 style="font-size:20px;color:#1e293b;margin:0 0 16px;">Bonjour ${p.clientName},</h2>
    <p style="color:#475569;line-height:1.7;">
      Malgré notre précédent rappel${p.premierRelanceDate ? ` du ${fmtDate(p.premierRelanceDate)}` : ""},
      votre règlement de la facture <strong>${p.factureNumero}</strong>
      (montant : <strong>${fmt(p.totalTtc)} TTC</strong>, échéance : <strong>${fmtDate(p.dateEcheance)}</strong>)
      ne nous est toujours pas parvenu.
    </p>
    <p style="color:#475569;line-height:1.7;">
      Nous vous mettons en demeure de procéder au règlement de cette somme
      <strong>dans un délai de 8 jours</strong>.
    </p>
    ${p.penalites > 0 ? `
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#78350f;">
      Pénalités de retard applicables (15 %/an) : <strong>${fmt(p.penalites)}</strong>
    </div>` : ""}
    ${bankTable(p.iban, p.bic)}
    <p style="color:#64748b;font-size:13px;">
      Cordialement,<br/><strong>${p.companyName}</strong>
    </p>
  `);
  return { subject, html };
}

function templateMiseEnDemeure(p: RelanceEmailParams) {
  const indemnite = 40;
  const subject = `MISE EN DEMEURE — Facture ${p.factureNumero} — Paiement immédiatement exigible`;
  const html = emailWrapper(p.companyName, "#dc2626", `
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
      <strong style="color:#991b1b;">⚠ MISE EN DEMEURE DE PAYER</strong>
    </div>
    <p style="color:#475569;line-height:1.7;"><strong>Madame, Monsieur,</strong></p>
    <p style="color:#475569;line-height:1.7;">
      Par la présente mise en demeure, nous vous notifions que le paiement de la facture
      <strong>${p.factureNumero}</strong> d'un montant de <strong>${fmt(p.totalTtc)} TTC</strong>,
      échue le <strong>${fmtDate(p.dateEcheance)}</strong>, est exigible depuis
      <strong>${p.joursRetard} jours</strong> et demeure impayé à ce jour malgré nos précédentes relances.
    </p>
    <p style="color:#475569;line-height:1.7;">
      Nous vous mettons formellement en demeure de régler la totalité de cette somme
      <strong>sous 8 jours calendaires</strong> à compter de la réception du présent courrier.
    </p>
    ${p.penalites > 0 ? `
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;">
      <tr>
        <td style="padding:8px 10px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;">Capital dû</td>
        <td style="padding:8px 10px;border:1px solid #fecaca;font-weight:700;">${fmt(p.totalTtc)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;">Pénalités (15 %/an — ${p.joursRetard} j)</td>
        <td style="padding:8px 10px;border:1px solid #fecaca;font-weight:700;">${fmt(p.penalites)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;border:1px solid #fecaca;background:#fef2f2;color:#991b1b;">Indemnité forfaitaire (art. D.441-5)</td>
        <td style="padding:8px 10px;border:1px solid #fecaca;font-weight:700;">${fmt(indemnite)}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:10px;border:1px solid #fecaca;font-weight:700;color:#dc2626;">TOTAL EXIGIBLE</td>
        <td style="padding:10px;border:1px solid #fecaca;font-weight:700;font-size:15px;color:#dc2626;">${fmt(p.totalTtc + p.penalites + indemnite)}</td>
      </tr>
    </table>` : ""}
    <p style="color:#475569;line-height:1.7;font-size:13px;">
      À défaut de règlement dans ce délai, nous nous réservons le droit d'engager
      toute procédure de recouvrement judiciaire, dont les frais resteront à votre charge.
    </p>
    ${bankTable(p.iban, p.bic)}
    <p style="color:#64748b;font-size:13px;">
      <strong>${p.companyName}</strong>
    </p>
  `);
  return { subject, html };
}

// ─── Fonction principale ─────────────────────────────────────────────────────

export async function sendRelanceEmail(type: RelanceType, params: RelanceEmailParams) {
  const { subject, html } =
    type === "ENVOI"           ? templateEnvoi(params)
    : type === "RELANCE_1"     ? templateRelance1(params)
    : type === "RELANCE_2"     ? templateRelance2(params)
    :                            templateMiseEnDemeure(params);

  const filename = `facture-${params.factureNumero.replace(/\//g, "-")}.pdf`;

  await resend.emails.send({
    from: resolveFrom(params.companyName),
    to: resolveTo(params.to),
    subject,
    html,
    attachments: [
      {
        filename,
        content: params.pdfBuffer,
      },
    ],
  });

  return subject;
}

interface SendDevisEmailParams {
  to: string;
  clientName: string;
  companyName: string;
  devisNumero: string;
  devisObjet: string;
  totalTtc: number;
  pdfUrl: string;
  expiresAt?: Date;
}

export async function sendDevisEmail(params: SendDevisEmailParams) {
  const { to, clientName, companyName, devisNumero, devisObjet, totalTtc, pdfUrl, expiresAt } =
    params;

  const montant = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(totalTtc);

  return resend.emails.send({
    from: resolveFrom(companyName),
    to: resolveTo(to),
    subject: `Devis ${devisNumero} — ${devisObjet}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e293b;">Bonjour ${clientName},</h2>
        <p>Veuillez trouver ci-joint votre devis <strong>${devisNumero}</strong> pour <em>${devisObjet}</em>.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 24px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Référence</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${devisNumero}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Objet</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">${devisObjet}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Montant TTC</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${montant}</strong></td>
          </tr>
          ${expiresAt ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Validité</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">
              Jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}
            </td>
          </tr>` : ""}
        </table>
        <a href="${pdfUrl}" style="
          display: inline-block;
          background-color: #3b82f6;
          color: white;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin-bottom: 24px;
        ">
          Télécharger le devis (PDF)
        </a>
        <p style="color: #64748b; font-size: 14px;">
          Pour toute question, n'hésitez pas à nous contacter.<br/>
          Cordialement,<br/>
          <strong>${companyName}</strong>
        </p>
      </div>
    `,
  });
}

interface SendFactureEmailParams {
  to: string;
  clientName: string;
  companyName: string;
  factureNumero: string;
  totalTtc: number;
  dateEcheance: Date;
  pdfUrl: string;
  iban: string;
  bic: string;
}

export async function sendFactureEmail(params: SendFactureEmailParams) {
  const { to, clientName, companyName, factureNumero, totalTtc, dateEcheance, pdfUrl, iban, bic } =
    params;

  const montant = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(totalTtc);

  return resend.emails.send({
    from: resolveFrom(companyName),
    to: resolveTo(to),
    subject: `Facture ${factureNumero} — ${montant}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1e293b;">Bonjour ${clientName},</h2>
        <p>Veuillez trouver ci-joint la facture <strong>${factureNumero}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 24px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Référence</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${factureNumero}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Montant TTC</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>${montant}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">Échéance</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; color: #dc2626;">
              <strong>${dateEcheance.toLocaleDateString("fr-FR")}</strong>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">IBAN</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">${iban}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #e2e8f0;">BIC</td>
            <td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace;">${bic}</td>
          </tr>
        </table>
        <a href="${pdfUrl}" style="
          display: inline-block;
          background-color: #3b82f6;
          color: white;
          padding: 12px 24px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          margin-bottom: 24px;
        ">
          Télécharger la facture (PDF)
        </a>
        <p style="color: #64748b; font-size: 14px;">
          Pénalités de retard : 15% par an exigibles à 45 jours.<br/>
          Indemnité forfaitaire de recouvrement : 40 €.<br/><br/>
          Cordialement,<br/>
          <strong>${companyName}</strong>
        </p>
      </div>
    `,
  });
}
