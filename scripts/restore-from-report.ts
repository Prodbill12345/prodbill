/**
 * scripts/restore-from-report.ts
 * Recrée les sections et lignes de devis à partir des PDFs sur disque,
 * en utilisant uniquement pdf-parse (pas d'appel à l'API Claude).
 *
 * Usage :
 *   npx tsx scripts/restore-from-report.ts [--dry-run] [--force]
 *
 * --dry-run  : affiche ce qui serait fait sans écrire en base
 * --force    : recrée les sections même si le devis en a déjà
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient, LigneTag } from "@prisma/client";

dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

const REPORT_PATH = path.join(process.cwd(), "import-report.json");
const DEVIS_DIR   = path.join(process.env.HOME!, "Desktop/import-prodbill/devis");

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ─── Types rapport ────────────────────────────────────────────────────────────

interface ReportEntry {
  fichier: string;
  type: "devis" | "facture";
  statut: "importe" | "skip" | "erreur";
  numero?: string;
  client?: string;
  message?: string;
}

// ─── Helpers montants ─────────────────────────────────────────────────────────

function parseFrAmount(s: string): number | null {
  // "1 200,00" | "1200,00" | "1.200,00" → 1200.00
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3})/g, "")  // séparateur milliers
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 0 ? null : n;
}

// ─── Détection tag ────────────────────────────────────────────────────────────

function detectTag(libelle: string): LigneTag {
  const l = libelle.toLowerCase();
  if (/com[eé]dien|voix\s*off|artiste|acteur|narrateur|speaker|droit.*(artiste|autor)/.test(l)) return "ARTISTE";
  if (/musique|licence|droits?\s+music|librairie/.test(l)) return "MUSIQUE";
  if (/agent|commission|agence/.test(l)) return "AGENT";
  if (/studio|cabine|salle|r[eé]gie|enregistrement|recording/.test(l)) return "STUDIO";
  // tout ce qui ressemble à une prestation technique
  if (/technicien|ing[eé]nieur|\bda\b|directeur\s+artistique|montage|mixage|\bmix\b|sound\s+design|\bsd\b|r[eé]alisation|chef\s+de\s+projet|monteur|mixeur/.test(l)) return "TECHNICIEN_HCS";
  return "STUDIO";
}

// ─── Détection en-têtes de section ────────────────────────────────────────────

const SECTION_PATTERNS = [
  /^voix[\s\-]?off/i,
  /^studio/i,
  /^enregistrement/i,
  /^musique/i,
  /^droits?\s+musicaux/i,
  /^direction\s+artistique/i,
  /^mixage/i,
  /^montage/i,
  /^sound\s+design/i,
  /^technicien/i,
  /^artiste/i,
  /^agent/i,
  /^prestations?/i,
  /^honoraires?/i,
  /^post[\s\-]?synchro/i,
];

function isSectionHeader(line: string): boolean {
  return SECTION_PATTERNS.some((re) => re.test(line.trim()));
}

// ─── Parser texte PDF → sections/lignes ──────────────────────────────────────

interface ParsedLigne {
  libelle: string;
  tag: LigneTag;
  quantite: number;
  prixUnit: number;
}

interface ParsedSection {
  nom: string;
  lignes: ParsedLigne[];
}

// Montant français : chiffres + espaces optionnels + virgule + 2 chiffres
const AMT_RE = /(\d[\d\s]*,\d{2})\s*€?/;
// Ligne avec quantité explicite : "description  2  400,00"
const QTY_LINE_RE = /^(.+?)\s{2,}(\d+)\s{2,}(\d[\d\s]*,\d{2})\s*€?\s*$/;

function parsePdfText(text: string): ParsedSection[] {
  const rawLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const SKIP_RE = /^(total|sous[\s\-]?total|tva|ttc|remise|net\s+à\s+payer|montant|page\s+\d|caleson|devis|bon\s+de\s+commande|n°|ref)/i;

  const sections: ParsedSection[] = [];
  let current: ParsedSection = { nom: "Prestations", lignes: [] };

  for (const line of rawLines) {
    if (SKIP_RE.test(line)) continue;

    // En-tête de section
    if (isSectionHeader(line)) {
      if (current.lignes.length > 0) sections.push(current);
      current = { nom: line.replace(/[:*•–\-]+$/, "").trim(), lignes: [] };
      continue;
    }

    // Tentative de parsing : description  qty  montant
    const fullMatch = line.match(QTY_LINE_RE);
    if (fullMatch) {
      const libelle  = fullMatch[1].trim();
      const quantite = parseInt(fullMatch[2], 10) || 1;
      const prixUnit = parseFrAmount(fullMatch[3]) ?? 0;
      if (prixUnit > 0 && prixUnit < 50_000 && libelle.length > 2) {
        current.lignes.push({ libelle, tag: detectTag(libelle), quantite, prixUnit });
        continue;
      }
    }

    // Tentative de parsing : ligne avec montant uniquement
    const amtMatch = line.match(AMT_RE);
    if (amtMatch) {
      const prixUnit = parseFrAmount(amtMatch[1]) ?? 0;
      if (prixUnit > 0 && prixUnit < 50_000) {
        const libelle = line
          .replace(AMT_RE, "")
          .replace(/\s*x\s*\d+\s*$/i, "")
          .replace(/\s{2,}/g, " ")
          .trim()
          .replace(/[;:,]+$/, "")
          .trim();
        if (libelle.length > 2) {
          current.lignes.push({
            libelle,
            tag: detectTag(libelle) !== "STUDIO" ? detectTag(libelle) : detectTag(current.nom),
            quantite: 1,
            prixUnit,
          });
        }
      }
    }
  }

  if (current.lignes.length > 0) sections.push(current);

  // Fallback si aucune ligne extraite
  if (sections.length === 0 || sections.every((s) => s.lignes.length === 0)) {
    return [{
      nom: "Import restauré",
      lignes: [{
        libelle: "Prestation (voir PDF original)",
        tag: "STUDIO",
        quantite: 1,
        prixUnit: 0,
      }],
    }];
  }

  return sections;
}

// ─── Extraction texte PDF ─────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string> {
  const parser = new PDFParse({ url: filePath });
  const result = await parser.getText();
  return result.text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`ProdBill — Restore from report${DRY_RUN ? " [DRY-RUN]" : ""}${FORCE ? " [FORCE]" : ""}`);
  console.log(`${"═".repeat(60)}\n`);

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquante dans .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(REPORT_PATH)) {
    console.error(`❌ Rapport introuvable : ${REPORT_PATH}`);
    process.exit(1);
  }

  const report: { details: ReportEntry[] } = JSON.parse(
    fs.readFileSync(REPORT_PATH, "utf-8")
  );

  const devisEntries = report.details.filter(
    (e) => e.type === "devis" && e.statut === "importe" && e.numero
  );

  // Dédupliquer par numero (garder le premier fichier rencontré)
  const seen = new Set<string>();
  const unique = devisEntries.filter((e) => {
    if (!e.numero || seen.has(e.numero)) return false;
    seen.add(e.numero);
    return true;
  });

  console.log(`📋 ${devisEntries.length} entrées devis dans le rapport`);
  console.log(`   → ${unique.length} numéros uniques à traiter\n`);

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) {
    console.error("❌ Aucune company en base.");
    process.exit(1);
  }
  console.log(`🏢 Company : ${company.name}\n`);

  let nbRestore = 0;
  let nbSkip    = 0;
  let nbPdfMiss = 0;
  let nbDbMiss  = 0;
  let nbErreur  = 0;

  for (const entry of unique) {
    const numero  = entry.numero!;
    const fichier = entry.fichier;

    try {
      // 1. Trouver le devis en base
      const devis = await prisma.devis.findFirst({
        where: { companyId: company.id, numero },
        select: { id: true, sections: { select: { id: true } } },
      });

      if (!devis) {
        console.log(`⚠️  Devis ${numero} introuvable en base — ${fichier}`);
        nbDbMiss++;
        continue;
      }

      // 2. Vérifier si des sections existent déjà
      if (devis.sections.length > 0 && !FORCE) {
        console.log(`⏭  Devis ${numero} — déjà ${devis.sections.length} section(s) en base`);
        nbSkip++;
        continue;
      }

      // 3. Trouver le PDF
      const pdfPath = path.join(DEVIS_DIR, fichier);
      if (!fs.existsSync(pdfPath)) {
        console.log(`📄 Devis ${numero} — PDF introuvable : ${fichier}`);
        nbPdfMiss++;
        continue;
      }

      // 4. Extraire le texte du PDF
      const text = await extractText(pdfPath);

      // 5. Parser le texte en sections/lignes
      const parsed = parsePdfText(text);
      const nbLignes = parsed.reduce((s, sec) => s + sec.lignes.length, 0);

      if (DRY_RUN) {
        console.log(`🔍 [DRY-RUN] Devis ${numero} — ${parsed.length} section(s), ${nbLignes} ligne(s)`);
        parsed.forEach((s) => {
          console.log(`   Section "${s.nom}" (${s.lignes.length} lignes)`);
          s.lignes.slice(0, 3).forEach((l) =>
            console.log(`     • [${l.tag}] ${l.libelle} × ${l.quantite} = ${l.prixUnit}€`)
          );
        });
        nbRestore++;
        continue;
      }

      // 6. Supprimer les anciennes sections si --force
      if (FORCE && devis.sections.length > 0) {
        await prisma.devisSection.deleteMany({ where: { devisId: devis.id } });
      }

      // 7. Créer les sections et lignes
      await prisma.devis.update({
        where: { id: devis.id },
        data: {
          sections: {
            create: parsed.map((section, sIdx) => ({
              titre: section.nom,
              ordre: sIdx,
              lignes: {
                create: section.lignes.map((ligne, lIdx) => ({
                  libelle: ligne.libelle,
                  tag: ligne.tag,
                  quantite: ligne.quantite,
                  prixUnit: ligne.prixUnit,
                  total: ligne.quantite * ligne.prixUnit,
                  tauxIndexation: 0,
                  ordre: lIdx,
                })),
              },
            })),
          },
        },
      });

      console.log(`✅ Devis ${numero} — ${parsed.length} section(s), ${nbLignes} ligne(s) restaurée(s)`);
      nbRestore++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ Devis ${numero} — ${msg}`);
      nbErreur++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Résumé :`);
  console.log(`  ✅ ${nbRestore} restauré(s)`);
  console.log(`  ⏭  ${nbSkip} ignoré(s) (sections déjà présentes)`);
  console.log(`  📄 ${nbPdfMiss} PDF introuvable(s)`);
  console.log(`  ⚠️  ${nbDbMiss} devis absent(s) de la base`);
  console.log(`  ❌ ${nbErreur} erreur(s)`);
  if (DRY_RUN) console.log(`\n  Mode DRY-RUN — aucune donnée écrite.`);
  if (!FORCE && nbSkip > 0) console.log(`\n  → Utilisez --force pour écraser les sections existantes.`);
  console.log(`${"═".repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
