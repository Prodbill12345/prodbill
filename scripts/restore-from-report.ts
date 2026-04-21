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
import { PrismaClient, LigneTag, FactureType, FactureStatut } from "@prisma/client";

dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

const REPORT_PATH   = path.join(process.cwd(), "import-report.json");
const DEVIS_DIR     = path.join(process.env.HOME!, "Desktop/import-prodbill/devis");
const FACTURES_DIR  = path.join(process.env.HOME!, "Desktop/import-prodbill/factures");

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

// ─── Filtre lignes auto-calculées ─────────────────────────────────────────────

const LIGNES_CALCUL_RE = /charges?\s+sociales?|frais\s+g[eé]n[eé]raux|marge\s+de\s+fonctionnement|^tva\b|^total\b/i;

function isLigneCalcul(libelle: string): boolean {
  return LIGNES_CALCUL_RE.test(libelle.trim());
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

  const SKIP_RE = /^(total|sous[\s\-]?total|tva|ttc|remise|net\s+à\s+payer|montant|page\s+\d|caleson|devis|bon\s+de\s+commande|n°|ref|charges?\s+sociales?|frais\s+g[eé]n[eé]raux|marge\s+de\s+fonctionnement)/i;

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

// ─── Parser texte PDF → données facture ──────────────────────────────────────

interface ParsedFacture {
  totalHt:       number;
  tva:           number;
  totalTtc:      number;
  dateEmission:  Date | null;
  dateReglement: Date | null;
  numeroBdc:     string | null;
  type:          FactureType;
}

// Détection type depuis le numéro (ex: "F26001-A1", "F26001-S1", "AV-26001")
function detectFactureType(numero: string): FactureType {
  const u = numero.toUpperCase();
  if (u.startsWith("AV") || u.includes("-AV")) return "AVOIR";
  if (/-A\d+$/.test(u)) return "ACOMPTE";
  if (/-S\d+$/.test(u)) return "SOLDE";
  return "SOLDE"; // défaut : facture de solde
}

// Date française : "31/12/2025" ou "31 décembre 2025"
const DATE_FR_RE   = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/;
const MOIS_FR: Record<string, number> = {
  janvier:1, février:2, mars:3, avril:4, mai:5, juin:6,
  juillet:7, août:8, septembre:9, octobre:10, novembre:11, décembre:12,
};

function parseDateFr(s: string): Date | null {
  const m = s.match(DATE_FR_RE);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
    return isNaN(date.getTime()) ? null : date;
  }
  // "31 décembre 2025"
  const ml = s.toLowerCase().match(/(\d{1,2})\s+([\wéûîà]+)\s+(\d{4})/);
  if (ml) {
    const mois = MOIS_FR[ml[2]];
    if (mois) {
      const date = new Date(parseInt(ml[3]), mois - 1, parseInt(ml[1]));
      return isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function parseFacturePdfText(text: string, numero: string): ParsedFacture {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);

  let totalHt: number | null = null;
  let tva: number | null = null;
  let totalTtc: number | null = null;
  let dateEmission: Date | null = null;
  let dateReglement: Date | null = null;
  let numeroBdc: string | null = null;

  // Regex montant FR : supporte "1 200,00", "1200,00"
  const amtRe = /(\d[\d\s]*,\d{2})\s*€?/;

  for (const line of lines) {
    const lu = line.toLowerCase();

    // Total HT
    if (!totalHt && /total\s*(ht|hors\s*taxe)/i.test(line)) {
      const m = line.match(amtRe);
      if (m) totalHt = parseFrAmount(m[1]);
    }
    // TVA
    if (!tva && /^tva\b|^\s*tva\s+20/i.test(line)) {
      const m = line.match(amtRe);
      if (m) tva = parseFrAmount(m[1]);
    }
    // Total TTC
    if (!totalTtc && /total\s*(ttc|toutes?\s*taxes)/i.test(line)) {
      const m = line.match(amtRe);
      if (m) totalTtc = parseFrAmount(m[1]);
    }
    // Net à payer (fallback total TTC)
    if (!totalTtc && /net\s*[àa]\s*payer/i.test(line)) {
      const m = line.match(amtRe);
      if (m) totalTtc = parseFrAmount(m[1]);
    }
    // Date d'émission
    if (!dateEmission && /date.*facture|émise?\s+le|date\s+d.*émission/i.test(lu)) {
      const m = line.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/);
      if (m) dateEmission = parseDateFr(m[0]);
    }
    // Date de règlement / paiement
    if (!dateReglement && /date.*r[eè]gl|pay[eé]e?\s+le|r[eè]gl[eé]e?\s+le/i.test(lu)) {
      const m = line.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/);
      if (m) dateReglement = parseDateFr(m[0]);
    }
    // Numéro BDC client
    if (!numeroBdc && /bon\s+de\s+commande|n°?\s*bdc|commande\s+n°?|ref\.?\s*client/i.test(lu)) {
      const m = line.match(/(\b\d{5,}\b)/);
      if (m) numeroBdc = m[1];
    }
  }

  // Fallback TVA / TTC depuis HT
  if (totalHt !== null && tva === null) tva = Math.round(totalHt * 0.2 * 100) / 100;
  if (totalHt !== null && totalTtc === null && tva !== null)
    totalTtc = Math.round((totalHt + tva) * 100) / 100;

  return {
    totalHt:       totalHt ?? 0,
    tva:           tva ?? 0,
    totalTtc:      totalTtc ?? 0,
    dateEmission,
    dateReglement,
    numeroBdc,
    type:          detectFactureType(numero),
  };
}

// ─── Extraction texte PDF ─────────────────────────────────────────────────────

async function extractText(filePath: string): Promise<string> {
  const parser = new PDFParse({ url: filePath });
  const result = await parser.getText();
  return result.text;
}

// ─── Résolution client ────────────────────────────────────────────────────────

async function resolveClient(
  companyId: string,
  nom: string
): Promise<{ id: string } | null> {
  const find = (term: string) =>
    prisma.client.findFirst({
      where: { companyId, name: { contains: term, mode: "insensitive" } },
      select: { id: true, name: true },
    });

  // 1. Nom complet
  const full = await find(nom);
  if (full) return full;

  // Découper en mots significatifs (≥ 3 caractères, hors mots outils)
  const STOP = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "par", "sur", "the", "and"]);
  const words = nom
    .split(/[\s\-_&\/]+/)
    .map((w) => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, ""))
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));

  if (words.length === 0) return null;

  // 2. Premier mot
  const byFirst = await find(words[0]);
  if (byFirst) return byFirst;

  // 3. Chaque mot restant
  for (const word of words.slice(1)) {
    const byWord = await find(word);
    if (byWord) return byWord;
  }

  return null;
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
      // 1. Trouver le devis en base avec ses sections/lignes existantes
      const devis = await prisma.devis.findFirst({
        where: { companyId: company.id, numero },
        select: {
          id: true,
          sections: {
            orderBy: { ordre: "asc" },
            select: {
              id: true,
              titre: true,
              ordre: true,
              lignes: {
                orderBy: { ordre: "asc" },
                select: {
                  libelle: true,
                  tag: true,
                  quantite: true,
                  prixUnit: true,
                  total: true,
                  tauxIndexation: true,
                  ordre: true,
                },
              },
            },
          },
        },
      });

      if (!devis) {
        console.log(`⚠️  Devis ${numero} introuvable en base — ${fichier}`);
        nbDbMiss++;
        continue;
      }

      // 2. Si des sections existent en base, les utiliser (extraites par Claude)
      //    en filtrant uniquement les lignes de calcul automatique.
      //    Sans --force : skip si les sections semblent déjà propres.
      let parsed: ParsedSection[];
      let source: "db" | "pdf";

      if (devis.sections.length > 0) {
        // Reconstruire ParsedSection depuis les données DB, filtrer les calculs
        const fromDb: ParsedSection[] = devis.sections.map((sec) => ({
          nom: sec.titre,
          lignes: sec.lignes
            .filter((l) => !isLigneCalcul(l.libelle))
            .map((l) => ({
              libelle:  l.libelle,
              tag:      l.tag as LigneTag,
              quantite: l.quantite,
              prixUnit: l.prixUnit,
            })),
        })).filter((s) => s.lignes.length > 0);

        const nbCalcFiltered = devis.sections.reduce(
          (acc, sec) => acc + sec.lignes.filter((l) => isLigneCalcul(l.libelle)).length,
          0
        );

        if (!FORCE) {
          // Vérifier si des lignes de calcul existent — si non, tout est propre
          if (nbCalcFiltered === 0) {
            console.log(`⏭  Devis ${numero} — ${devis.sections.length} section(s) en base, aucune ligne de calcul`);
            nbSkip++;
            continue;
          }
          // Des lignes de calcul existent : recommander --force
          console.log(`⚠️  Devis ${numero} — ${nbCalcFiltered} ligne(s) de calcul détectée(s) → relancer avec --force`);
          nbSkip++;
          continue;
        }

        parsed = fromDb;
        source = "db";
        console.log(`   [DB→filtre] Devis ${numero} — ${nbCalcFiltered} ligne(s) de calcul supprimée(s)`);
      } else {
        // Pas de sections en base : fallback PDF
        const pdfPath = path.join(DEVIS_DIR, fichier);
        if (!fs.existsSync(pdfPath)) {
          console.log(`📄 Devis ${numero} — PDF introuvable : ${fichier}`);
          nbPdfMiss++;
          continue;
        }
        const text = await extractText(pdfPath);
        const fromPdf = parsePdfText(text);
        parsed = fromPdf.map((sec) => ({
          ...sec,
          lignes: sec.lignes.filter((l) => !isLigneCalcul(l.libelle)),
        })).filter((s) => s.lignes.length > 0);
        source = "pdf";
      }

      const nbLignes = parsed.reduce((s, sec) => s + sec.lignes.length, 0);

      if (DRY_RUN) {
        console.log(`🔍 [DRY-RUN] Devis ${numero} [${source}] — ${parsed.length} section(s), ${nbLignes} ligne(s)`);
        parsed.forEach((s) => {
          console.log(`   Section "${s.nom}" (${s.lignes.length} lignes)`);
          s.lignes.slice(0, 3).forEach((l) =>
            console.log(`     • [${l.tag}] ${l.libelle} × ${l.quantite} = ${l.prixUnit}€`)
          );
        });
        nbRestore++;
        continue;
      }

      // Supprimer les anciennes sections
      if (devis.sections.length > 0) {
        await prisma.devisSection.deleteMany({ where: { devisId: devis.id } });
      }

      // Créer les sections et lignes filtrées
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

      console.log(`✅ Devis ${numero} [${source}] — ${parsed.length} section(s), ${nbLignes} ligne(s) restaurée(s)`);
      nbRestore++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ Devis ${numero} — ${msg}`);
      nbErreur++;
    }
  }

  // ─── Restauration factures ─────────────────────────────────────────────────

  const factureEntries = report.details.filter(
    (e) => e.type === "facture" && e.statut === "importe" && e.numero
  );

  const seenF = new Set<string>();
  const uniqueF = factureEntries.filter((e) => {
    if (!e.numero || seenF.has(e.numero)) return false;
    seenF.add(e.numero);
    return true;
  });

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📋 ${factureEntries.length} entrées facture dans le rapport`);
  console.log(`   → ${uniqueF.length} numéros uniques à traiter\n`);

  let nbFRestore = 0;
  let nbFSkip    = 0;
  let nbFPdfMiss = 0;
  let nbFClientMiss = 0;
  let nbFErreur  = 0;

  // Cache client nom → id
  const clientCache = new Map<string, string>();

  for (const entry of uniqueF) {
    const numero  = entry.numero!;
    const fichier = entry.fichier;
    const clientNom = entry.client ?? "";

    try {
      // 1. Résoudre clientId
      let clientId = clientCache.get(clientNom);
      if (!clientId) {
        const found = await resolveClient(company.id, clientNom);
        if (!found) {
          console.log(`⚠️  Facture ${numero} — client introuvable : "${clientNom}"`);
          nbFClientMiss++;
          continue;
        }
        clientId = found.id;
        clientCache.set(clientNom, clientId);
      }

      // 2. Trouver le PDF
      const pdfPath = path.join(FACTURES_DIR, fichier);
      if (!fs.existsSync(pdfPath)) {
        console.log(`📄 Facture ${numero} — PDF introuvable : ${fichier}`);
        nbFPdfMiss++;
        continue;
      }

      // 3. Extraire et parser le PDF
      const text   = await extractText(pdfPath);
      const parsed = parseFacturePdfText(text, numero);

      if (DRY_RUN) {
        console.log(
          `🔍 [DRY-RUN] Facture ${numero} — HT=${parsed.totalHt}€ TTC=${parsed.totalTtc}€` +
          ` type=${parsed.type}${parsed.dateEmission ? ` émise=${parsed.dateEmission.toLocaleDateString("fr-FR")}` : ""}` +
          `${parsed.dateReglement ? ` réglée=${parsed.dateReglement.toLocaleDateString("fr-FR")}` : ""}` +
          `${parsed.numeroBdc ? ` BDC=${parsed.numeroBdc}` : ""}`
        );
        nbFRestore++;
        continue;
      }

      // 4. Upsert facture
      const existing = await prisma.facture.findUnique({ where: { numero } });

      if (existing && !FORCE) {
        console.log(`⏭  Facture ${numero} — déjà en base (${existing.statut})`);
        nbFSkip++;
        continue;
      }

      // Statut : si dateReglement → PAYEE, sinon EMISE
      const statut: FactureStatut = parsed.dateReglement ? "PAYEE" : "EMISE";

      const data = {
        companyId:     company.id,
        clientId,
        numero,
        type:          parsed.type,
        statut,
        totalHt:       parsed.totalHt,
        tva:           parsed.tva,
        totalTtc:      parsed.totalTtc,
        dateEmission:  parsed.dateEmission,
        dateReglement: parsed.dateReglement,
        numeroBdc:     parsed.numeroBdc,
        emiseAt:       parsed.dateEmission,
        createdById:   "import",
      };

      await prisma.facture.upsert({
        where:  { numero },
        create: data,
        update: {
          totalHt:       data.totalHt,
          tva:           data.tva,
          totalTtc:      data.totalTtc,
          statut:        data.statut,
          dateEmission:  data.dateEmission,
          dateReglement: data.dateReglement,
          numeroBdc:     data.numeroBdc,
          emiseAt:       data.emiseAt,
        },
      });

      console.log(`✅ Facture ${numero} — ${parsed.type} ${parsed.totalHt}€ HT (${statut})`);
      nbFRestore++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ Facture ${numero} — ${msg}`);
      nbFErreur++;
    }
  }

  // ─── Résumé ────────────────────────────────────────────────────────────────

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Résumé devis :`);
  console.log(`  ✅ ${nbRestore} restauré(s)`);
  console.log(`  ⏭  ${nbSkip} ignoré(s) (sections déjà présentes)`);
  console.log(`  📄 ${nbPdfMiss} PDF introuvable(s)`);
  console.log(`  ⚠️  ${nbDbMiss} devis absent(s) de la base`);
  console.log(`  ❌ ${nbErreur} erreur(s)`);
  console.log(`\nRésumé factures :`);
  console.log(`  ✅ ${nbFRestore} restaurée(s)`);
  console.log(`  ⏭  ${nbFSkip} ignorée(s) (déjà en base)`);
  console.log(`  📄 ${nbFPdfMiss} PDF introuvable(s)`);
  console.log(`  ⚠️  ${nbFClientMiss} client(s) introuvable(s)`);
  console.log(`  ❌ ${nbFErreur} erreur(s)`);
  if (DRY_RUN) console.log(`\n  Mode DRY-RUN — aucune donnée écrite.`);
  if (!FORCE && (nbSkip > 0 || nbFSkip > 0)) console.log(`\n  → Utilisez --force pour écraser les données existantes.`);
  console.log(`${"═".repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
