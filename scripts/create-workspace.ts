/**
 * scripts/create-workspace.ts
 * Onboarding d'un nouveau workspace ProdBill depuis un fichier Excel.
 *
 * Usage :
 *   npx tsx scripts/create-workspace.ts --excel <path.xlsx> [--logo <logo.png>]
 *                                       [--commit]
 *
 * Par défaut DRY-RUN (n'écrit rien). Ajouter --commit pour exécuter.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import ExcelJS from "exceljs";

dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { put, del } from "@vercel/blob";
import { createClerkClient } from "@clerk/backend";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { excel: "", logo: "", commit: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--excel") out.excel = args[++i];
    else if (a === "--logo") out.logo = args[++i];
    else if (a === "--commit") out.commit = true;
  }
  return out;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

const C_BOLD = "\x1b[1m";
const C_CYAN = "\x1b[36m";
const C_GREEN = "\x1b[32m";
const C_YELLOW = "\x1b[33m";
const C_RED = "\x1b[31m";
const C_DIM = "\x1b[2m";
const C_RESET = "\x1b[0m";

function bar(n = 72) { return "─".repeat(n); }
function section(title: string) {
  console.log(`\n${C_CYAN}${C_BOLD}═══ ${title} ${C_RESET}`);
}
function kv(label: string, value: string | number | null | undefined, w = 32) {
  const v = value === null || value === undefined || value === "" ? `${C_DIM}∅${C_RESET}` : String(value);
  console.log(`  ${label.padEnd(w)} ${v}`);
}

// ─── Helpers de parsing Excel ─────────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((r) => r.text).join("").trim();
    }
    if ("text" in o) return String(o.text).trim();
    if ("result" in o) return cellToString(o.result);
    if ("hyperlink" in o) return cellToString(o.hyperlink);
  }
  return String(v).trim();
}

function getCellByLabel(ws: ExcelJS.Worksheet, label: string, valueCol = "B"): string {
  const target = label.trim().toLowerCase();
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = cellToString(ws.getCell(`A${r}`).value).toLowerCase();
    if (a === target) return cellToString(ws.getCell(`${valueCol}${r}`).value);
  }
  return "";
}

// ─── Nettoyage des valeurs ────────────────────────────────────────────────────

function cleanSiret(raw: string): string {
  // Excel transforme "99051957100014" en 99051957100014.0 (float). Nettoyer :
  // garde les chiffres, retire le .0 final, padding éventuel.
  const digits = raw.replace(/\D/g, "");
  return digits.slice(0, 14);
}

function cleanPhone(raw: string): string {
  // "33604131260" → "+33 6 04 13 12 60"
  // "0604131260"  → "+33 6 04 13 12 60"
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  let n = digits;
  if (n.startsWith("0") && n.length === 10) n = "33" + n.slice(1);
  if (!n.startsWith("33")) return raw.trim();
  const rest = n.slice(2); // 9 digits expected
  if (rest.length !== 9) return raw.trim();
  // Format : +33 X XX XX XX XX
  const groups = [
    rest.slice(0, 1),
    rest.slice(1, 3),
    rest.slice(3, 5),
    rest.slice(5, 7),
    rest.slice(7, 9),
  ];
  return "+33 " + groups.join(" ");
}

function parsePct(raw: string): number | null {
  // "57 %" → 0.57 ; "57%" → 0.57 ; "0.57" → 0.57
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace("%", "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // Si > 1, on suppose pourcentage (ex 57 → 0.57)
  if (n > 1) return Math.round((n / 100) * 10000) / 10000;
  return Math.round(n * 10000) / 10000;
}

function parseDelaiJours(raw: string): number | null {
  // Excel passe "45" en "0.45" si la cellule est formatée pourcentage.
  // On détecte : si valeur < 1, multiplier par 100.
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n > 0 && n < 1) return Math.round(n * 100);
  return Math.round(n);
}

function extractCounterDeparture(raw: string): number {
  // "D26001" → 26001 ; "26001" → 26001
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function cleanHex(raw: string): string {
  // "#e21335 R:226 V:19 B:53" → "#e21335"
  const m = raw.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0].toLowerCase() : (raw.startsWith("#") ? raw.split(/\s/)[0] : "#3B82F6");
}

// ─── Modèle extracté ──────────────────────────────────────────────────────────

interface WorkspaceData {
  // 1. Entreprise
  nomCommercial: string;
  raisonSociale: string;
  formeJuridique: string;
  siret: string;
  tvaIntra: string;
  capital: string;
  codeNaf: string;
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  telephone: string;
  email: string;
  siteWeb: string;
  nomBanque: string;
  iban: string;
  bic: string;
  // 2. Paramétrage métier
  tauxCsComedien: number | null;
  tauxCsTech: number | null;
  tauxFg: number | null;
  tauxMarge: number | null;
  tauxTva: number | null;
  delaiJours: number | null;
  penalitesPct: number | null;
  indemniteRecouvrement: string;
  sectionsCustom: Array<{ ordre: number; nom: string; categorie: string }>;
  prefixeDevis: string;
  prefixeFacture: string;
  numeroDepartDevis: number;
  numeroDepartFacture: number;
  // 3. Identité visuelle
  couleurHex: string;
  police: string;
  emailSignataire: string;
  telephonePdf: string;
  // 4. Utilisateurs
  users: Array<{ name: string; email: string; role: string }>;
  // 5. Clients
  clients: Array<{
    nom: string; raisonSociale: string; codePostal: string; ville: string;
    pays: string; contactNom: string; contactEmail: string;
  }>;
  // 6. Comédiens & Agents
  comediens: Array<{ nomComplet: string; type: string; email: string; telephone: string; agent: string }>;
  agents: Array<{ nom: string; commission: number; email: string; telephone: string; notes: string }>;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

async function parseExcel(filePath: string): Promise<WorkspaceData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws1 = wb.getWorksheet("1. Entreprise");
  const ws2 = wb.getWorksheet("2. Paramétrage métier");
  const ws3 = wb.getWorksheet("3. Identité visuelle");
  const ws4 = wb.getWorksheet("4. Utilisateurs");
  const ws5 = wb.getWorksheet("5. Clients récurrents");
  const ws6 = wb.getWorksheet("6. Comédiens & Agents");
  if (!ws1 || !ws2 || !ws3 || !ws4 || !ws5 || !ws6) {
    throw new Error("Onglet(s) manquant(s) : 1-6 attendus");
  }

  const d: WorkspaceData = {
    nomCommercial: getCellByLabel(ws1, "Nom commercial"),
    raisonSociale: getCellByLabel(ws1, "Raison sociale"),
    formeJuridique: getCellByLabel(ws1, "Forme juridique"),
    siret: cleanSiret(getCellByLabel(ws1, "SIRET (14 chiffres)")),
    tvaIntra: getCellByLabel(ws1, "Numéro de TVA intracommunautaire"),
    capital: getCellByLabel(ws1, "Capital social"),
    codeNaf: getCellByLabel(ws1, "Code NAF / APE"),
    adresse: getCellByLabel(ws1, "Adresse (rue)").replace(/\s+/g, " ").trim(),
    codePostal: getCellByLabel(ws1, "Code postal"),
    ville: getCellByLabel(ws1, "Ville"),
    pays: getCellByLabel(ws1, "Pays") || "France",
    telephone: cleanPhone(getCellByLabel(ws1, "Téléphone professionnel")),
    email: getCellByLabel(ws1, "Email professionnel (facturation)"),
    siteWeb: getCellByLabel(ws1, "Site web"),
    nomBanque: getCellByLabel(ws1, "Nom de la banque"),
    iban: getCellByLabel(ws1, "IBAN").replace(/\s/g, ""),
    bic: getCellByLabel(ws1, "BIC / SWIFT"),

    tauxCsComedien: parsePct(getCellByLabel(ws2, "Taux Charges Sociales — Comédien")),
    tauxCsTech:     parsePct(getCellByLabel(ws2, "Taux Charges Sociales — Technicien")),
    tauxFg:         parsePct(getCellByLabel(ws2, "Taux Frais Généraux (FG)")),
    tauxMarge:      parsePct(getCellByLabel(ws2, "Taux Marge de fonctionnement")),
    tauxTva:        parsePct(getCellByLabel(ws2, "Taux TVA principal")),
    delaiJours:     parseDelaiJours(getCellByLabel(ws2, "Délai de paiement (en jours)")),
    penalitesPct:   parsePct(getCellByLabel(ws2, "Pénalités de retard (% annuel)")),
    indemniteRecouvrement: getCellByLabel(ws2, "Indemnité forfaitaire de recouvrement") || "40 €",
    sectionsCustom: [],
    prefixeDevis:    getCellByLabel(ws2, "Préfixe souhaité pour les devis"),
    prefixeFacture:  getCellByLabel(ws2, "Préfixe souhaité pour les factures"),
    numeroDepartDevis:   extractCounterDeparture(getCellByLabel(ws2, "Numéro de départ devis (2026)")),
    numeroDepartFacture: extractCounterDeparture(getCellByLabel(ws2, "Numéro de départ facture (2026)")),

    couleurHex:      cleanHex(getCellByLabel(ws3, "Couleur principale (hexadécimal)")),
    police:          getCellByLabel(ws3, "Police préférée (si vous en avez)") || "Helvetica",
    emailSignataire: getCellByLabel(ws3, "Email signataire des devis"),
    telephonePdf:    cleanPhone(getCellByLabel(ws3, "Téléphone à afficher sur PDF")),

    users: [],
    clients: [],
    comediens: [],
    agents: [],
  };

  // Sections custom : lignes 22-29, col A = ordre, col B = nom, col C = catégorie
  for (let r = 22; r <= 30; r++) {
    const ordre = cellToString(ws2.getCell(`A${r}`).value);
    const nom = cellToString(ws2.getCell(`B${r}`).value);
    const cat = cellToString(ws2.getCell(`C${r}`).value);
    if (nom.trim()) {
      d.sectionsCustom.push({
        ordre: parseInt(ordre, 10) || d.sectionsCustom.length + 1,
        nom: nom.trim(),
        categorie: cat.trim() || "AUTRE",
      });
    }
  }

  // Users : à partir de la ligne 6 jusqu'à la première ligne vide (max R16)
  for (let r = 6; r <= 16; r++) {
    const name = cellToString(ws4.getCell(`A${r}`).value);
    const email = cellToString(ws4.getCell(`B${r}`).value);
    const role = cellToString(ws4.getCell(`C${r}`).value);
    if (!name && !email) break;
    if (!name || !email) continue;
    d.users.push({ name, email, role: role || "MEMBER" });
  }

  // Clients : à partir de R5 jusqu'à la première ligne vide
  for (let r = 5; r <= 100; r++) {
    const nom = cellToString(ws5.getCell(`A${r}`).value);
    if (!nom) break;
    d.clients.push({
      nom,
      raisonSociale: cellToString(ws5.getCell(`B${r}`).value) || nom,
      codePostal: cellToString(ws5.getCell(`C${r}`).value),
      ville: cellToString(ws5.getCell(`D${r}`).value),
      pays: cellToString(ws5.getCell(`E${r}`).value) || "France",
      contactNom: cellToString(ws5.getCell(`F${r}`).value),
      contactEmail: cellToString(ws5.getCell(`G${r}`).value),
    });
  }

  // Comédiens : à partir de R6 jusqu'à la section AGENTS (R22)
  for (let r = 6; r <= 21; r++) {
    const nomComplet = cellToString(ws6.getCell(`A${r}`).value);
    if (!nomComplet) continue;
    d.comediens.push({
      nomComplet,
      type:      cellToString(ws6.getCell(`B${r}`).value),
      email:     cellToString(ws6.getCell(`C${r}`).value),
      telephone: cleanPhone(cellToString(ws6.getCell(`D${r}`).value)),
      agent:     cellToString(ws6.getCell(`E${r}`).value),
    });
  }
  // Agents : à partir de R24 (entête R23)
  for (let r = 24; r <= 50; r++) {
    const nom = cellToString(ws6.getCell(`A${r}`).value);
    if (!nom) break;
    const commRaw = cellToString(ws6.getCell(`B${r}`).value);
    d.agents.push({
      nom,
      commission: parseFloat(commRaw.replace(/\s|%/g, "").replace(",", ".")) || 10,
      email:      cellToString(ws6.getCell(`C${r}`).value),
      telephone:  cleanPhone(cellToString(ws6.getCell(`D${r}`).value)),
      notes:      cellToString(ws6.getCell(`E${r}`).value),
    });
  }

  return d;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(d: WorkspaceData): string[] {
  const errors: string[] = [];
  if (!d.nomCommercial) errors.push("nomCommercial manquant");
  if (!d.siret || !/^\d{14}$/.test(d.siret)) errors.push(`SIRET invalide (doit faire 14 chiffres) — reçu : "${d.siret}"`);
  if (!d.tvaIntra) errors.push("TVA intra manquante");
  if (!d.adresse) errors.push("Adresse manquante");
  if (!d.codePostal || !d.ville) errors.push("Code postal ou ville manquant");
  if (!d.iban) errors.push("IBAN manquant");
  if (!d.bic) errors.push("BIC manquant");
  // Au moins 1 OWNER
  const owner = d.users.find((u) => u.role.toUpperCase() === "OWNER");
  if (!owner) errors.push("Aucun utilisateur OWNER renseigné");
  if (owner && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner.email)) {
    errors.push(`Email Owner invalide : "${owner.email}"`);
  }
  return errors;
}

// ─── Dry-run print ────────────────────────────────────────────────────────────

function printDryRun(d: WorkspaceData) {
  section("1. Identité légale & coordonnées");
  kv("Nom commercial", d.nomCommercial);
  kv("Raison sociale", d.raisonSociale);
  kv("Forme juridique", d.formeJuridique);
  kv("SIRET (14 chiffres)", d.siret);
  kv("TVA intra", d.tvaIntra);
  kv("Capital social", d.capital);
  kv("Code NAF", d.codeNaf);
  kv("Adresse", `${d.adresse}, ${d.codePostal} ${d.ville}, ${d.pays}`);
  kv("Téléphone", d.telephone);
  kv("Email facturation", d.email);
  kv("Banque", d.nomBanque);
  kv("IBAN", d.iban);
  kv("BIC", d.bic);

  section("2. Paramétrage métier");
  kv("CS Comédien",   d.tauxCsComedien != null ? `${(d.tauxCsComedien * 100).toFixed(2)} %` : "—");
  kv("CS Technicien", d.tauxCsTech     != null ? `${(d.tauxCsTech     * 100).toFixed(2)} %` : "—");
  kv("Frais généraux",d.tauxFg         != null ? `${(d.tauxFg         * 100).toFixed(2)} %` : "—");
  kv("Marge",         d.tauxMarge      != null ? `${(d.tauxMarge      * 100).toFixed(2)} %` : "—");
  kv("TVA",           d.tauxTva        != null ? `${(d.tauxTva        * 100).toFixed(2)} %` : "—");
  kv("Délai paiement", d.delaiJours != null ? `${d.delaiJours} jours` : "—");
  kv("Pénalités retard", d.penalitesPct != null ? `${(d.penalitesPct * 100).toFixed(2)} %/an` : "—");
  kv("Indemnité recouvrement", d.indemniteRecouvrement);
  kv("Préfixe devis", d.prefixeDevis || "—");
  kv("Préfixe facture", d.prefixeFacture || "—");
  kv("N° départ devis",   d.numeroDepartDevis);
  kv("N° départ facture", d.numeroDepartFacture);
  console.log(`  ${"Sections custom".padEnd(32)} ${d.sectionsCustom.length === 0 ? `${C_DIM}∅${C_RESET}` : ""}`);
  for (const s of d.sectionsCustom) {
    console.log(`    ${C_DIM}${s.ordre}.${C_RESET} ${s.nom} ${C_DIM}[${s.categorie}]${C_RESET}`);
  }

  section("3. Identité visuelle");
  kv("Couleur principale", d.couleurHex);
  kv("Police", d.police);
  kv("Email signataire PDF", d.emailSignataire);
  kv("Téléphone PDF", d.telephonePdf);

  section(`4. Utilisateurs (${d.users.length})`);
  for (const u of d.users) {
    console.log(`  • ${u.name.padEnd(28)} ${u.email.padEnd(36)} [${u.role.toUpperCase()}]`);
  }

  section(`5. Clients préchargés (${d.clients.length})`);
  for (const c of d.clients) {
    console.log(`  • ${c.nom.padEnd(24)} ${c.codePostal} ${c.ville.padEnd(20)} ${c.contactEmail}`);
  }

  section(`6. Comédiens (${d.comediens.length}) / Agents (${d.agents.length})`);
  for (const c of d.comediens) console.log(`  • Comédien : ${c.nomComplet} (${c.type})`);
  for (const a of d.agents)    console.log(`  • Agent    : ${a.nom} — commission ${a.commission}%`);
}

// ─── Commit (création réelle) ─────────────────────────────────────────────────

/**
 * Commit avec rollback complet : si la transaction Prisma échoue après
 * la création de ressources externes (Clerk org, Vercel Blob), on les
 * supprime explicitement pour ne pas laisser d'orphelins.
 *
 * Ordre de création :
 *   1. Vercel Blob (logo)        ← rollback : del()
 *   2. Clerk Organization         ← rollback : clerk.organizations.deleteOrganization()
 *   3. Prisma transaction (Company + counters + clients + comediens + agents)
 *   4. Clerk Invitation           (best-effort, ne déclenche pas rollback si échec)
 */
async function commit(d: WorkspaceData, logoPath?: string): Promise<void> {
  console.log(`\n${C_GREEN}${C_BOLD}🚀 COMMIT — création réelle${C_RESET}`);

  // Vérif SIRET unique
  const existing = await prisma.company.findUnique({ where: { siret: d.siret } });
  if (existing) {
    throw new Error(`Une Company avec SIRET ${d.siret} existe déjà (${existing.name}, id=${existing.id})`);
  }

  // Tracking des ressources externes pour rollback en cas d'échec.
  const created: { logoUrl?: string; clerkOrgId?: string } = {};
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  async function rollback(reason: string) {
    console.log(`\n${C_RED}${C_BOLD}✗ Échec — rollback des ressources externes${C_RESET}`);
    console.log(`  Cause : ${reason}`);
    if (created.clerkOrgId) {
      try {
        await clerk.organizations.deleteOrganization(created.clerkOrgId);
        console.log(`  ✓ Clerk Organization supprimée : ${created.clerkOrgId}`);
      } catch (e) {
        console.log(`  ${C_YELLOW}⚠${C_RESET} Échec suppression Clerk org ${created.clerkOrgId} : ${(e as Error).message}`);
        console.log(`    → À supprimer manuellement depuis le dashboard Clerk`);
      }
    }
    if (created.logoUrl) {
      try {
        await del(created.logoUrl);
        console.log(`  ✓ Logo Blob supprimé : ${created.logoUrl}`);
      } catch (e) {
        console.log(`  ${C_YELLOW}⚠${C_RESET} Échec suppression Blob ${created.logoUrl} : ${(e as Error).message}`);
        console.log(`    → À supprimer manuellement depuis le dashboard Vercel`);
      }
    }
  }

  try {
    // 1. Upload logo Vercel Blob
    if (logoPath) {
      if (!fs.existsSync(logoPath)) {
        throw new Error(`Logo introuvable : ${logoPath}`);
      }
      const buf = fs.readFileSync(logoPath);
      const slug = d.nomCommercial.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const blob = await put(`logos/${slug}/${path.basename(logoPath)}`, buf, {
        access: "public",
        contentType: logoPath.endsWith(".png") ? "image/png" : "image/svg+xml",
        addRandomSuffix: true,
      });
      created.logoUrl = blob.url;
      console.log(`  ✓ Logo uploadé : ${blob.url}`);
    }

    // 2. Clerk Organization
    const org = await clerk.organizations.createOrganization({
      name: d.nomCommercial,
      slug: d.nomCommercial.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50),
    });
    created.clerkOrgId = org.id;
    console.log(`  ✓ Clerk Organization créée : ${org.id} (${org.slug})`);

    // 3. Prisma transaction
    const owner = d.users.find((u) => u.role.toUpperCase() === "OWNER")!;
    const conditionsPaiement = `Paiement à ${d.delaiJours ?? 30} jours. Pénalités de retard : ${((d.penalitesPct ?? 0.15) * 100).toFixed(0)}% par an exigibles à 45 jours. Indemnité forfaitaire de recouvrement : ${d.indemniteRecouvrement}.`;

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: d.nomCommercial,
          siret: d.siret,
          tvaIntra: d.tvaIntra,
          address: d.adresse,
          city: d.ville,
          postalCode: d.codePostal,
          email: d.email,
          phone: d.telephone,
          iban: d.iban,
          bic: d.bic,
          nomBanque: d.nomBanque,
          primaryColor: d.couleurHex,
          logoUrl: created.logoUrl ?? null,
          defaultTauxCsComedien: d.tauxCsComedien ?? 0.57,
          defaultTauxCsTech:     d.tauxCsTech     ?? 0.65,
          defaultTauxFg:         d.tauxFg         ?? 0.05,
          defaultTauxMarge:      d.tauxMarge      ?? 0.15,
          conditionsPaiement,
          prefixDevis:   d.prefixeDevis,
          prefixFacture: d.prefixeFacture,
          customSections: d.sectionsCustom.map((s) => ({
            nom: s.nom,
            categorie: s.categorie,
          })),
          clerkOrgId: org.id,
        },
      });

      const yearNow = new Date().getFullYear();
      if (d.numeroDepartDevis > 0) {
        await tx.counter.create({
          data: { companyId: company.id, year: yearNow, type: "DEVIS", value: d.numeroDepartDevis - 1 },
        });
      }
      if (d.numeroDepartFacture > 0) {
        await tx.counter.create({
          data: { companyId: company.id, year: yearNow, type: "FACTURE", value: d.numeroDepartFacture - 1 },
        });
      }

      let nbClients = 0;
      for (const c of d.clients) {
        await tx.client.create({
          data: {
            companyId: company.id,
            name: c.nom,
            address: "",
            city: c.ville,
            postalCode: c.codePostal,
            email: c.contactEmail,
            notes: c.contactNom ? `Contact : ${c.contactNom}` : null,
          },
        });
        nbClients++;
      }

      let nbAgents = 0;
      const agentNameToId = new Map<string, string>();
      for (const a of d.agents) {
        const parts = a.nom.split(/\s+/);
        const createdAgent = await tx.agent.create({
          data: {
            companyId: company.id,
            nom: parts.slice(1).join(" ") || parts[0],
            prenom: parts.length > 1 ? parts[0] : null,
            agence: a.nom,
            email: a.email || null,
            telephone: a.telephone || null,
            tauxCommission: a.commission,
          },
        });
        agentNameToId.set(a.nom.toLowerCase(), createdAgent.id);
        nbAgents++;
      }

      let nbComediens = 0;
      for (const c of d.comediens) {
        const parts = c.nomComplet.split(/\s+/);
        const prenom = parts[0] ?? "";
        const nom = parts.slice(1).join(" ") || prenom;
        const agentId = c.agent ? agentNameToId.get(c.agent.toLowerCase()) ?? null : null;
        await tx.comedien.create({
          data: { companyId: company.id, prenom, nom, agentId },
        });
        nbComediens++;
      }

      return { company, nbClients, nbAgents, nbComediens };
    });

    console.log(`  ✓ Company créée : ${result.company.id} (${result.company.name})`);
    console.log(`  ✓ ${result.nbClients} client(s), ${result.nbAgents} agent(s), ${result.nbComediens} comédien(s) préchargés`);
    console.log(`  ✓ ${d.sectionsCustom.length} section(s) custom enregistrée(s) sur Company.customSections`);

    // 4. Invitation Clerk au Owner (best-effort — pas de rollback si échec ici,
    // la Company est créée, l'invitation peut être renvoyée manuellement).
    // IMPORTANT : redirectUrl doit pointer vers /sign-up de l'app ProdBill.
    // Si on passe undefined, Clerk retombe sur l'URL par défaut de l'instance
    // (dashboard.clerk.com), ce qui envoie le client au mauvais endroit.
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://prodbill.vercel.app";
    try {
      const invitation = await clerk.invitations.createInvitation({
        emailAddress: owner.email,
        redirectUrl: `${appBaseUrl}/sign-up`,
        publicMetadata: { companyId: result.company.id, role: "ADMIN", clerkOrgId: org.id },
      });
      console.log(`  ✓ Invitation Clerk envoyée à ${owner.email} (id=${invitation.id})`);
      console.log(`    → redirectUrl : ${appBaseUrl}/sign-up`);
    } catch (e) {
      console.log(`  ${C_YELLOW}⚠${C_RESET} Échec invitation Clerk : ${(e as Error).message}`);
      console.log(`    → Inviter manuellement ${owner.email} depuis le dashboard Clerk pour l'org ${org.slug}`);
    }

    // 5. Récap
    console.log(`\n${C_GREEN}${C_BOLD}═════════════════════════════════════════════════════════════${C_RESET}`);
    console.log(`${C_GREEN}${C_BOLD}WORKSPACE CRÉÉ${C_RESET}`);
    console.log(bar());
    kv("Company ID",        result.company.id);
    kv("Clerk Org ID",      org.id);
    kv("Clerk Org Slug",    org.slug);
    kv("Logo URL",          created.logoUrl ?? "—");
    kv("Sections custom",   d.sectionsCustom.length);
    kv("Préfixe devis",     d.prefixeDevis || "—");
    kv("Préfixe facture",   d.prefixeFacture || "—");
    kv("Counters initialisés", `${d.numeroDepartDevis > 0 ? "devis" : ""}${d.numeroDepartDevis > 0 && d.numeroDepartFacture > 0 ? " + " : ""}${d.numeroDepartFacture > 0 ? "facture" : ""}`);
    console.log();
    kv("URL de connexion", `${appBaseUrl}/sign-in`);
    kv("Owner notifié", owner.email);
    console.log();
  } catch (err) {
    await rollback((err as Error).message);
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  if (!args.excel) {
    console.error("Usage : npx tsx scripts/create-workspace.ts --excel <path.xlsx> [--logo <logo>] [--commit]");
    process.exit(1);
  }
  if (!fs.existsSync(args.excel)) {
    console.error(`Fichier introuvable : ${args.excel}`);
    process.exit(1);
  }

  console.log(`\n${C_BOLD}ProdBill — Création de workspace${C_RESET}`);
  console.log(C_DIM + bar() + C_RESET);
  console.log(`  Excel  : ${args.excel}`);
  console.log(`  Logo   : ${args.logo || "—"}`);
  console.log(`  Mode   : ${args.commit ? `${C_RED}COMMIT (écriture réelle)${C_RESET}` : `${C_YELLOW}DRY-RUN (par défaut)${C_RESET}`}`);

  const data = await parseExcel(args.excel);

  printDryRun(data);

  const errors = validate(data);
  console.log();
  console.log(bar());
  if (errors.length > 0) {
    console.log(`${C_RED}${C_BOLD}✗ ${errors.length} erreur(s) de validation :${C_RESET}`);
    for (const e of errors) console.log(`  • ${C_RED}${e}${C_RESET}`);
    console.log();
    process.exit(1);
  }
  console.log(`${C_GREEN}✓ Validation OK — toutes les données obligatoires sont présentes${C_RESET}`);
  console.log();

  if (!args.commit) {
    console.log(`${C_YELLOW}DRY-RUN terminé. Pour créer réellement, relancer avec ${C_BOLD}--commit${C_RESET}${C_YELLOW} :${C_RESET}`);
    console.log(`  npx tsx scripts/create-workspace.ts --excel ${args.excel}${args.logo ? ` --logo ${args.logo}` : ""} --commit\n`);
    await prisma.$disconnect();
    return;
  }

  try {
    await commit(data, args.logo || undefined);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`${C_RED}Erreur fatale :${C_RESET}`, err);
  prisma.$disconnect().finally(() => process.exit(1));
});
