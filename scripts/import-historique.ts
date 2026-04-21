/**
 * scripts/import-historique.ts
 * Importe les PDFs historiques de Caleson en base via Claude API.
 *
 * Usage :
 *   npx tsx scripts/import-historique.ts [--dry-run]
 *
 * Prérequis :
 *   - Dossiers ~/Desktop/import-prodbill/devis/ et factures/ avec les PDFs
 *   - ANTHROPIC_API_KEY dans .env.local
 *   - DATABASE_URL dans .env.local
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, LigneTag, DevisStatut, FactureType, FactureStatut } from "@prisma/client";

dotenv.config({ path: ".env.local" });

// ─── Config ──────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const IMPORT_DIR = path.join(process.env.HOME!, "Desktop/import-prodbill");
const DEVIS_DIR = path.join(IMPORT_DIR, "devis");
const FACTURES_DIR = path.join(IMPORT_DIR, "factures");
const REPORT_PATH = path.join(process.cwd(), "import-report.json");
const MODEL = "claude-sonnet-4-6";

// ─── Prisma ───────────────────────────────────────────────────────────────────

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Anthropic ────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types extraits par Claude ─────────────────────────────────────────────────

interface LigneExtraite {
  libelle: string;
  // ARTISTE | TECHNICIEN_HCS | STUDIO | MUSIQUE | AGENT
  tag: string;
  quantite: number;
  prixUnit: number;
  tauxIndexation?: number;
}

interface SectionExtrait {
  nom: string;
  lignes: LigneExtraite[];
}

interface ClientExtrait {
  nom: string;
  adresse?: string;
  siret?: string;
  email?: string;
}

interface DevisExtrait {
  numero?: string;
  date?: string;
  nomProjet?: string;
  objet?: string;
  client: ClientExtrait;
  sections: SectionExtrait[];
  totalHt?: number;
  totalTtc?: number;
  statut?: string;
  tauxPipe?: number;
}

interface LignesExtrait {
  dateSeance: string | null;
  sections: SectionExtrait[];
}

interface FactureExtrait {
  numero: string;
  date?: string;
  type?: string; // ACOMPTE | SOLDE | AVOIR
  client: ClientExtrait;
  devisReference?: string;
  lignes?: LigneExtraite[];
  totalHt: number;
  tva?: number;
  totalTtc?: number;
  statutPaiement?: string;
  numeroBdc?: string;
  dateReglement?: string;
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

interface ReportEntry {
  fichier: string;
  type: "devis" | "facture";
  statut: "importe" | "skip" | "erreur";
  numero?: string;
  client?: string;
  message?: string;
}

const report: ReportEntry[] = [];

function log(icon: string, msg: string) {
  console.log(`${icon} ${msg}`);
}

// ─── Calculs (miroir de CLAUDE.md) ────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface TauxConfig {
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
}

function calculerTotaux(
  lignes: { tag: string; quantite: number; prixUnit: number }[],
  taux: TauxConfig
) {
  const sousTotal = round2(lignes.reduce((s, l) => s + l.quantite * l.prixUnit, 0));
  const baseComedien = lignes.filter((l) => l.tag === "ARTISTE").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
  const baseTech = lignes.filter((l) => l.tag === "TECHNICIEN_HCS").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
  const csComedien = round2(baseComedien * taux.tauxCsComedien);
  const csTechniciens = round2(baseTech * taux.tauxCsTech);
  const baseMarge = round2(sousTotal + csTechniciens);
  const fraisGeneraux = round2(baseMarge * taux.tauxFg);
  const marge = round2(baseMarge * taux.tauxMarge);
  const totalHt = round2(sousTotal + csComedien + csTechniciens + baseMarge * taux.tauxFg + baseMarge * taux.tauxMarge);
  const tva = round2(totalHt * 0.2);
  const totalTtc = round2(totalHt + tva);
  return { sousTotal, csComedien, csTechniciens, baseMarge, fraisGeneraux, marge, totalHt, tva, totalTtc };
}

// ─── Extraction PDF → texte ───────────────────────────────────────────────────

async function extractTextFromPdf(filePath: string): Promise<string> {
  const parser = new PDFParse({ url: filePath });
  const result = await parser.getText();
  return result.text;
}

// ─── Appel Claude ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "Tu es un extracteur de données de devis/factures français. Réponds UNIQUEMENT en JSON valide, sans markdown.";

const DEVIS_PROMPT = `Extrais les données structurées de ce devis français.
Réponds avec ce JSON exact (toutes les clés sont optionnelles sauf client.nom) :
{
  "numero": "25-0042",
  "date": "JJ/MM/AAAA",
  "nomProjet": "...",
  "objet": "...",
  "client": { "nom": "...", "adresse": "...", "siret": "...", "email": "..." },
  "sections": [
    {
      "nom": "Nom de la section",
      "lignes": [
        {
          "libelle": "...",
          "tag": "ARTISTE",
          "quantite": 1,
          "prixUnit": 0.00,
          "tauxIndexation": 0
        }
      ]
    }
  ],
  "totalHt": 0.00,
  "totalTtc": 0.00,
  "statut": "BROUILLON"
}

Règles pour le champ "tag" :
- "ARTISTE" : comédien, acteur, voix, narrateur, artiste, droits artistiques
- "TECHNICIEN_HCS" : technicien, ingénieur son, DA, réalisateur, chef de projet, directeur artistique, monteur, mixeur
- "STUDIO" : location studio, salle, cabine, régie
- "MUSIQUE" : musique, droits musicaux, licence musicale
- "AGENT" : commission agent, frais d'agence

Statuts valides : BROUILLON, ENVOYE, ACCEPTE, REFUSE, EXPIRE

Texte du PDF :
`;

const LIGNES_PROMPT = `Extrais uniquement les lignes détaillées de ce devis français.
Réponds avec ce JSON exact :
{
  "dateSeance": "JJ/MM/AAAA ou null",
  "sections": [
    {
      "nom": "VOIX OFF",
      "lignes": [
        { "libelle": "Comédien | prestation", "tag": "ARTISTE", "quantite": 1, "prixUnit": 400 }
      ]
    }
  ]
}

Règles pour le champ "tag" :
- "ARTISTE" : comédien, acteur, voix, narrateur, artiste, droits artistiques, nom de personne
- "TECHNICIEN_HCS" : technicien, ingénieur son, DA, réalisateur, chef de projet, directeur artistique, monteur, mixeur
- "STUDIO" : location studio, salle, cabine, régie, forfait studio
- "MUSIQUE" : musique, droits musicaux, licence musicale
- "AGENT" : commission agent, frais d'agence

Inclure le nom du comédien dans le libellé si présent (ex: "Jean Dupont – voix off").
dateSeance : date de la séance d'enregistrement si présente dans le document, sinon null.

Texte du PDF :
`;

const FACTURE_PROMPT = `Extrais les données structurées de cette facture française.
Réponds avec ce JSON exact (numero et totalHt sont obligatoires) :
{
  "numero": "F26001",
  "date": "JJ/MM/AAAA",
  "type": "ACOMPTE",
  "client": { "nom": "...", "adresse": "...", "siret": "...", "email": "..." },
  "devisReference": "F25042",
  "lignes": [
    {
      "libelle": "...",
      "tag": "ARTISTE",
      "quantite": 1,
      "prixUnit": 0.00
    }
  ],
  "totalHt": 0.00,
  "tva": 0.00,
  "totalTtc": 0.00,
  "statutPaiement": "EMISE",
  "numeroBdc": "10000679",
  "dateReglement": "JJ/MM/AAAA"
}

IMPORTANT — distinction numero / numeroBdc :
- "numero" : numéro de FACTURE interne Caleson (format : lettre(s) + année + séquentiel, ex: F26001, F25042, FAC-2025-001). C'est le numéro émis par Caleson.
- "numeroBdc" : numéro de BON DE COMMANDE du CLIENT (format : long numérique, ex: 10000679, 4702097777, ou référence client comme "PO-2025-0042"). Ce numéro est fourni par le client, pas par Caleson. Si absent, mettre null.
Ne pas confondre les deux : le BDC client n'est JAMAIS le numéro de facture.

Types valides : ACOMPTE, SOLDE, AVOIR
Statuts valides : BROUILLON, EMISE, PAYEE_PARTIEL, PAYEE, EN_RETARD, ANNULEE

Règles "tag" identiques aux devis.

Texte du PDF :
`;

async function callClaude(promptPrefix: string, pdfText: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: promptPrefix + pdfText,
      },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Réponse Claude inattendue");
  return block.text.trim();
}

function parseJson<T>(raw: string): T {
  // Nettoie les éventuels backticks de markdown que Claude pourrait quand même inclure
  const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

// ─── Helpers date ─────────────────────────────────────────────────────────────

function parseFrDate(s?: string): Date | null {
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeTag(tag: string): LigneTag {
  const t = tag.toUpperCase().trim();
  const valid: LigneTag[] = ["ARTISTE", "TECHNICIEN_HCS", "STUDIO", "MUSIQUE", "AGENT"];
  if ((valid as string[]).includes(t)) return t as LigneTag;
  return "FORFAIT" in valid ? ("FORFAIT" as LigneTag) : "STUDIO";
}

function normalizeDevisStatut(s?: string): DevisStatut {
  const valid: DevisStatut[] = ["BROUILLON", "ENVOYE", "ACCEPTE", "REFUSE", "EXPIRE"];
  if (s && (valid as string[]).includes(s.toUpperCase())) return s.toUpperCase() as DevisStatut;
  return "BROUILLON";
}

function normalizeFactureType(s?: string): FactureType {
  const valid: FactureType[] = ["ACOMPTE", "SOLDE", "AVOIR"];
  if (s && (valid as string[]).includes(s.toUpperCase())) return s.toUpperCase() as FactureType;
  // Détection depuis le numéro
  return "SOLDE";
}

function normalizeFactureStatut(s?: string): FactureStatut {
  const valid: FactureStatut[] = ["BROUILLON", "EMISE", "PAYEE_PARTIEL", "PAYEE", "EN_RETARD", "ANNULEE"];
  if (s && (valid as string[]).includes(s.toUpperCase())) return s.toUpperCase() as FactureStatut;
  return "EMISE";
}

// ─── Upsert client ────────────────────────────────────────────────────────────

async function findOrCreateClient(
  clientData: ClientExtrait,
  companyId: string
): Promise<string> {
  const existing = await prisma.client.findFirst({
    where: { companyId, name: { equals: clientData.nom, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  if (DRY_RUN) return `dry-run-client-${clientData.nom}`;

  const created = await prisma.client.create({
    data: {
      companyId,
      name: clientData.nom,
      address: clientData.adresse ?? "",
      email: clientData.email ?? "",
      siret: clientData.siret ?? undefined,
    },
    select: { id: true },
  });
  return created.id;
}

// ─── Import devis ─────────────────────────────────────────────────────────────

async function importDevis(
  filePath: string,
  companyId: string,
  userId: string,
  taux: TauxConfig
): Promise<ReportEntry> {
  const fileName = path.basename(filePath);
  log("⏳", `Devis  ${fileName}`);

  let pdfText: string;
  try {
    pdfText = await extractTextFromPdf(filePath);
  } catch (e) {
    return { fichier: fileName, type: "devis", statut: "erreur", message: `Lecture PDF : ${e}` };
  }

  let raw: string;
  try {
    raw = await callClaude(DEVIS_PROMPT, pdfText);
  } catch (e) {
    return { fichier: fileName, type: "devis", statut: "erreur", message: `Claude API : ${e}` };
  }

  let data: DevisExtrait;
  try {
    data = parseJson<DevisExtrait>(raw);
  } catch (e) {
    return { fichier: fileName, type: "devis", statut: "erreur", message: `JSON invalide : ${e}\n${raw.slice(0, 200)}` };
  }

  // Enrichissement si déjà en base : extraire les lignes et remplacer
  if (data.numero) {
    const existing = await prisma.devis.findFirst({
      where: { companyId, numero: data.numero },
      select: { id: true },
    });
    if (existing) {
      let rawLignes: string;
      try {
        rawLignes = await callClaude(LIGNES_PROMPT, pdfText);
      } catch (e) {
        return { fichier: fileName, type: "devis", statut: "erreur", message: `Claude API (lignes) : ${e}` };
      }

      let lignesData: LignesExtrait;
      try {
        lignesData = parseJson<LignesExtrait>(rawLignes);
      } catch (e) {
        return { fichier: fileName, type: "devis", statut: "erreur", message: `JSON lignes invalide : ${e}\n${rawLignes.slice(0, 200)}` };
      }

      if (DRY_RUN) {
        const nbLignes = lignesData.sections.reduce((s, sec) => s + sec.lignes.length, 0);
        log("🔍", `  [DRY-RUN] Enrichissement devis ${data.numero} — ${lignesData.sections.length} sections, ${nbLignes} lignes`);
        return { fichier: fileName, type: "devis", statut: "importe", numero: data.numero, client: data.client.nom, message: "dry-run enrichissement" };
      }

      // Supprimer les sections existantes (cascade → lignes)
      await prisma.devisSection.deleteMany({ where: { devisId: existing.id } });

      const allLignes = lignesData.sections.flatMap((s) => s.lignes);
      const totaux = calculerTotaux(allLignes, taux);

      await prisma.devis.update({
        where: { id: existing.id },
        data: {
          dateSeance: parseFrDate(lignesData.dateSeance ?? undefined),
          sousTotal: totaux.sousTotal,
          csComedien: totaux.csComedien,
          csTechniciens: totaux.csTechniciens,
          baseMarge: totaux.baseMarge,
          fraisGeneraux: totaux.fraisGeneraux,
          marge: totaux.marge,
          totalHt: totaux.totalHt,
          tva: totaux.tva,
          totalTtc: totaux.totalTtc,
          totalApresRemise: totaux.totalHt,
          sections: {
            create: lignesData.sections.map((section, sIdx) => ({
              titre: section.nom,
              ordre: sIdx,
              lignes: {
                create: section.lignes.map((ligne, lIdx) => ({
                  libelle: ligne.libelle,
                  tag: normalizeTag(ligne.tag),
                  quantite: ligne.quantite,
                  prixUnit: ligne.prixUnit,
                  total: round2(ligne.quantite * ligne.prixUnit),
                  tauxIndexation: 0,
                  ordre: lIdx,
                })),
              },
            })),
          },
        },
      });

      log("✅", `Enrichi  devis ${data.numero} — ${data.client.nom} (${allLignes.length} lignes)`);
      return { fichier: fileName, type: "devis", statut: "importe", numero: data.numero, client: data.client.nom, message: "enrichi" };
    }
  }

  const allLignes = data.sections.flatMap((s) => s.lignes);
  const totaux = calculerTotaux(allLignes, taux);

  if (DRY_RUN) {
    log("🔍", `  [DRY-RUN] Devis ${data.numero ?? "(sans numéro)"} — ${data.client.nom} — ${totaux.totalHt}€ HT`);
    data.sections.forEach((s) => {
      log("   ", `  Section "${s.nom}" (${s.lignes.length} lignes)`);
    });
    return { fichier: fileName, type: "devis", statut: "importe", numero: data.numero, client: data.client.nom, message: "dry-run" };
  }

  const clientId = await findOrCreateClient(data.client, companyId);
  const dateEmission = parseFrDate(data.date);

  const devis = await prisma.devis.create({
    data: {
      companyId,
      clientId,
      createdById: userId,
      numero: data.numero ?? null,
      objet: data.objet ?? data.nomProjet ?? "Import historique",
      nomProjet: data.nomProjet ?? null,
      statut: normalizeDevisStatut(data.statut),
      dateEmission,
      tauxCsComedien: taux.tauxCsComedien,
      tauxCsTech: taux.tauxCsTech,
      tauxFg: taux.tauxFg,
      tauxMarge: taux.tauxMarge,
      sousTotal: totaux.sousTotal,
      csComedien: totaux.csComedien,
      csTechniciens: totaux.csTechniciens,
      baseMarge: totaux.baseMarge,
      fraisGeneraux: totaux.fraisGeneraux,
      marge: totaux.marge,
      totalHt: totaux.totalHt,
      tva: totaux.tva,
      totalTtc: totaux.totalTtc,
      totalApresRemise: totaux.totalHt,
      sections: {
        create: data.sections.map((section, sIdx) => ({
          titre: section.nom,
          ordre: sIdx,
          lignes: {
            create: section.lignes.map((ligne, lIdx) => ({
              libelle: ligne.libelle,
              tag: normalizeTag(ligne.tag),
              quantite: ligne.quantite,
              prixUnit: ligne.prixUnit,
              total: round2(ligne.quantite * ligne.prixUnit),
              tauxIndexation: ligne.tauxIndexation ?? 0,
              ordre: lIdx,
            })),
          },
        })),
      },
    },
    select: { id: true, numero: true },
  });

  log("✅", `Devis ${devis.numero ?? devis.id} — ${data.client.nom}`);
  return { fichier: fileName, type: "devis", statut: "importe", numero: data.numero, client: data.client.nom };
}

// ─── Import facture ───────────────────────────────────────────────────────────

async function importFacture(
  filePath: string,
  companyId: string,
  userId: string
): Promise<ReportEntry> {
  const fileName = path.basename(filePath);
  log("⏳", `Facture ${fileName}`);

  let pdfText: string;
  try {
    pdfText = await extractTextFromPdf(filePath);
  } catch (e) {
    return { fichier: fileName, type: "facture", statut: "erreur", message: `Lecture PDF : ${e}` };
  }

  let raw: string;
  try {
    raw = await callClaude(FACTURE_PROMPT, pdfText);
  } catch (e) {
    return { fichier: fileName, type: "facture", statut: "erreur", message: `Claude API : ${e}` };
  }

  let data: FactureExtrait;
  try {
    data = parseJson<FactureExtrait>(raw);
  } catch (e) {
    return { fichier: fileName, type: "facture", statut: "erreur", message: `JSON invalide : ${e}\n${raw.slice(0, 200)}` };
  }

  if (!data.numero) {
    return { fichier: fileName, type: "facture", statut: "erreur", message: "Numéro de facture non extrait" };
  }

  // Skip si numéro déjà en base
  const existing = await prisma.facture.findUnique({ where: { numero: data.numero }, select: { id: true } });
  if (existing) {
    log("⏭ ", `Skip facture ${data.numero} (déjà en base)`);
    return { fichier: fileName, type: "facture", statut: "skip", numero: data.numero, client: data.client.nom, message: "Numéro déjà en base" };
  }

  // Déterminer le type depuis le numéro si non extrait
  let factureType: FactureType;
  if (data.type) {
    factureType = normalizeFactureType(data.type);
  } else if (data.numero.startsWith("AV-")) {
    factureType = "AVOIR";
  } else if (data.numero.includes("-A")) {
    factureType = "ACOMPTE";
  } else {
    factureType = "SOLDE";
  }

  const tva = data.tva ?? round2(data.totalHt * 0.2);
  const totalTtc = data.totalTtc ?? round2(data.totalHt + tva);

  if (DRY_RUN) {
    log("🔍", `  [DRY-RUN] Facture ${data.numero} — ${data.client.nom} — ${data.totalHt}€ HT (type: ${factureType})`);
    if (data.devisReference) log("   ", `  Lié au devis ${data.devisReference}`);
    return { fichier: fileName, type: "facture", statut: "importe", numero: data.numero, client: data.client.nom, message: "dry-run" };
  }

  const clientId = await findOrCreateClient(data.client, companyId);

  // Retrouver le devis lié par son numéro
  let devisId: string | null = null;
  if (data.devisReference) {
    const devis = await prisma.devis.findFirst({
      where: { companyId, numero: data.devisReference },
      select: { id: true },
    });
    devisId = devis?.id ?? null;
    if (!devis) log("⚠️ ", `  Devis lié ${data.devisReference} non trouvé en base`);
  }

  const dateEmission = parseFrDate(data.date);
  const dateReglement = parseFrDate(data.dateReglement);

  await prisma.facture.create({
    data: {
      companyId,
      clientId,
      devisId,
      createdById: userId,
      numero: data.numero,
      type: factureType,
      statut: normalizeFactureStatut(data.statutPaiement),
      totalHt: data.totalHt,
      tva,
      totalTtc,
      dateEmission,
      dateReglement,
      numeroBdc: data.numeroBdc ?? null,
      siretEmetteur: "",
      tvaIntraEmetteur: "",
      ibanEmetteur: "",
      bicEmetteur: "",
      nomBanqueEmetteur: "",
      conditionsPaiement: "",
      nomEmetteur: "",
      adresseEmetteur: "",
    },
  });

  log("✅", `Facture ${data.numero} — ${data.client.nom}`);
  return { fichier: fileName, type: "facture", statut: "importe", numero: data.numero, client: data.client.nom };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`ProdBill — Import historique${DRY_RUN ? " [DRY-RUN]" : ""}`);
  console.log(`${"═".repeat(60)}\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY manquante dans .env.local");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquante dans .env.local");
    process.exit(1);
  }

  // Vérifier les dossiers d'import
  for (const dir of [DEVIS_DIR, FACTURES_DIR]) {
    if (!fs.existsSync(dir)) {
      log("⚠️ ", `Dossier absent : ${dir} — création…`);
      if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Récupérer la company et l'utilisateur admin
  const company = await prisma.company.findFirst({ select: { id: true, name: true, defaultTauxCsComedien: true, defaultTauxCsTech: true, defaultTauxFg: true, defaultTauxMarge: true } });
  if (!company) {
    console.error("❌ Aucune company trouvée en base. Lancez d'abord seed-demo.ts.");
    process.exit(1);
  }
  log("🏢", `Company : ${company.name} (${company.id})`);

  const adminUser = await prisma.user.findFirst({ where: { companyId: company.id }, select: { id: true, name: true } });
  if (!adminUser) {
    console.error("❌ Aucun utilisateur trouvé pour la company.");
    process.exit(1);
  }
  log("👤", `Utilisateur : ${adminUser.name} (${adminUser.id})\n`);

  const taux: TauxConfig = {
    tauxCsComedien: company.defaultTauxCsComedien,
    tauxCsTech: company.defaultTauxCsTech,
    tauxFg: company.defaultTauxFg,
    tauxMarge: company.defaultTauxMarge,
  };

  // ── Import devis ──────────────────────────────────────────────────────────
  const devisPdfs = fs.existsSync(DEVIS_DIR)
    ? fs.readdirSync(DEVIS_DIR).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()
    : [];

  if (devisPdfs.length === 0) {
    log("ℹ️ ", "Aucun PDF dans le dossier devis/");
  } else {
    console.log(`\n── Devis (${devisPdfs.length} fichiers) ${"─".repeat(40)}\n`);
    for (const f of devisPdfs) {
      const entry = await importDevis(path.join(DEVIS_DIR, f), company.id, adminUser.id, taux);
      report.push(entry);
      if (entry.statut === "erreur") log("❌", `  ${entry.message}`);
    }
  }

  // ── Import factures ───────────────────────────────────────────────────────
  const facturesPdfs = fs.existsSync(FACTURES_DIR)
    ? fs.readdirSync(FACTURES_DIR).filter((f) => f.toLowerCase().endsWith(".pdf")).sort()
    : [];

  if (facturesPdfs.length === 0) {
    log("ℹ️ ", "Aucun PDF dans le dossier factures/");
  } else {
    console.log(`\n── Factures (${facturesPdfs.length} fichiers) ${"─".repeat(37)}\n`);
    for (const f of facturesPdfs) {
      const entry = await importFacture(path.join(FACTURES_DIR, f), company.id, adminUser.id);
      report.push(entry);
      if (entry.statut === "erreur") log("❌", `  ${entry.message}`);
    }
  }

  // ── Résumé ────────────────────────────────────────────────────────────────
  const imported = report.filter((r) => r.statut === "importe").length;
  const skipped = report.filter((r) => r.statut === "skip").length;
  const errors = report.filter((r) => r.statut === "erreur").length;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Résumé : ✅ ${imported} importé(s)  ⏭  ${skipped} ignoré(s)  ❌ ${errors} erreur(s)`);
  if (DRY_RUN) console.log("Mode DRY-RUN — aucune donnée écrite en base.");
  console.log(`${"═".repeat(60)}\n`);

  // ── Rapport JSON ──────────────────────────────────────────────────────────
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ date: new Date().toISOString(), dryRun: DRY_RUN, resume: { imported, skipped, errors }, details: report }, null, 2)
  );
  log("📄", `Rapport écrit dans : ${REPORT_PATH}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
