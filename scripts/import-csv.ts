/**
 * scripts/import-csv.ts
 * Purge la base puis importe le tableau de suivi Caleson (CSV latin1 séparé par ;).
 *
 * Usage :
 *   npx tsx scripts/import-csv.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  PrismaClient,
  DevisStatut,
  FactureType,
  FactureStatut,
} from "@prisma/client";

dotenv.config({ path: ".env.local" });

const CSV_PATH =
  process.env.CSV_PATH ??
  path.join(process.env.HOME!, "Desktop/Tableau_de_suivi_ProdBill.csv");

// ─── Prisma ───────────────────────────────────────────────────────────────────

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Purge ────────────────────────────────────────────────────────────────────

async function purgeBase() {
  console.log("\n🗑️  Suppression des données existantes...");

  // Ordre strict respectant les contraintes FK :
  // 1. DevisLigne (FK → DevisSection cascade, mais suppression explicite demandée)
  await prisma.devisLigne.deleteMany({});
  // 2. Pas de modèle FactureLigne dans le schéma
  // Tables intermédiaires nécessaires avant Facture / Devis
  await prisma.paiement.deleteMany({});     // FK → Facture sans cascade
  await prisma.relance.deleteMany({});      // FK → Facture avec cascade
  await prisma.auditLog.deleteMany({});     // FK optionnelle → Devis/Facture sans cascade
  await prisma.bDC.deleteMany({});          // FK → Devis sans cascade
  await prisma.devisSection.deleteMany({}); // FK → Devis avec cascade
  await prisma.budgetLigne.deleteMany({});  // FK → Client sans cascade
  // 3–7. Tables demandées dans l'ordre spécifié
  await prisma.facture.deleteMany({});
  await prisma.devis.deleteMany({});
  await prisma.comedien.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.agent.deleteMany({});

  console.log("✅ Base nettoyée, début de l'import...\n");
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string, sep = ";"): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
    } else if (c === sep && !inQuote) {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  cols.push(cur.trim());
  return cols;
}

// ─── Index des colonnes (pas de ligne d'en-tête) ──────────────────────────────

const COL = {
  SOCIETE:          0,
  AGENCE:           1,  // → nom du Client
  ANNONCEUR:        2,
  FACTURE_01:       3,
  NO_DEVIS:         4,
  NO_FACTURE:       5,
  NO_DEVIS_LIE:     6,
  ANNEE:            7,
  DATE:             8,
  DELAI:            9,
  STATUT_PAIEMENT:  10,
  DATE_REGLEMENT:   11,
  COMEDIEN:         12,
  STATUT_COMEDIEN:  13,
  COMMERCIAL:       14,
  DATE_SEANCE1:     15,
  DATE_SEANCE2:     16,
  // Les colonnes de montants sont à la fin de la ligne (positions variables selon
  // le nombre de colonnes "montants" intermédiaires) — on les lit depuis la fin.
  // TotalHT = avant-avant-avant-dernière, TVA = avant-avant-dernière,
  // TotalTTC = avant-dernière, MontantEncaissé = dernière.
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(s?: string): number {
  if (!s) return 0;
  const cleaned = s
    .replace(/[\s\t]/g, "")          // espaces et tabs
    .replace(/[^0-9,\-]/g, "")       // garde uniquement chiffres, virgule, tiret
    .replace(",", ".");               // virgule décimale → point
  if (cleaned === "" || cleaned === "-") return 0;
  return parseFloat(cleaned) || 0;
}

function cleanNumero(s?: string): string {
  if (!s) return "";
  // Conserve lettres, chiffres, tirets et espaces — retire tout le reste (Ê, Û, etc.)
  return s.replace(/[^a-zA-Z0-9\- ]/g, "").trim();
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const str = s.trim();
  if (str === "" || str === "?") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const jour = parseInt(parts[0], 10);
  const mois = parseInt(parts[1], 10);
  const annee = parseInt(parts[2], 10);
  if (isNaN(jour) || isNaN(mois) || isNaN(annee)) return null;
  const d = new Date(annee, mois - 1, jour);
  return isNaN(d.getTime()) ? null : d;
}

function mapDevisStatut(raw?: string): DevisStatut {
  if (!raw) return "BROUILLON";
  const u = raw.toUpperCase();
  if (u.includes("SIGN") || u.includes("ACCEPT")) return "ACCEPTE";
  if (u.includes("ANNUL") || u.includes("REFUS")) return "REFUSE";
  if (u.includes("ENVO") || u.includes("EMIT") || u.includes("ENVOY")) return "ENVOYE";
  if (u.includes("EXPIR")) return "EXPIRE";
  return "BROUILLON";
}

function mapFactureType(numero?: string): FactureType {
  if (!numero) return "SOLDE";
  if (numero.toUpperCase().startsWith("AV")) return "AVOIR";
  if (/-A\d/i.test(numero)) return "ACOMPTE";
  if (/-S\d/i.test(numero)) return "SOLDE";
  return "SOLDE";
}

function mapFactureStatut(raw?: string): FactureStatut {
  if (!raw) return "EMISE";
  const u = raw.toUpperCase();
  if (u.includes("PAY")) return "PAYEE";
  if (u.includes("PARTIEL")) return "PAYEE_PARTIEL";
  if (u.includes("RETARD")) return "EN_RETARD";
  if (u.includes("ANNUL")) return "ANNULEE";
  return "EMISE";
}

// Cache pour éviter les doublons en mémoire
const clientCache = new Map<string, string>();   // nom → id
const comedienCache = new Map<string, string>(); // "prenom nom" → id

async function findOrCreateClient(nom: string, companyId: string): Promise<string> {
  const key = nom.trim().toLowerCase();
  if (clientCache.has(key)) return clientCache.get(key)!;

  const existing = await prisma.client.findFirst({
    where: { companyId, name: { equals: nom.trim(), mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    clientCache.set(key, existing.id);
    return existing.id;
  }

  const created = await prisma.client.create({
    data: { companyId, name: nom.trim(), address: "", email: "" },
    select: { id: true },
  });
  clientCache.set(key, created.id);
  return created.id;
}

async function findOrCreateComedien(
  fullName: string,
  companyId: string
): Promise<string> {
  const key = fullName.trim().toLowerCase();
  if (comedienCache.has(key)) return comedienCache.get(key)!;

  const existing = await prisma.comedien.findFirst({
    where: {
      companyId,
      OR: [
        { nom: { equals: fullName.trim(), mode: "insensitive" } },
        {
          AND: [
            { prenom: { equals: fullName.split(" ")[0]?.trim(), mode: "insensitive" } },
            { nom: { equals: fullName.split(" ").slice(1).join(" ").trim(), mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    comedienCache.set(key, existing.id);
    return existing.id;
  }

  const parts = fullName.trim().split(/\s+/);
  const prenom = parts[0] ?? "";
  const nom = parts.slice(1).join(" ") || prenom;

  const created = await prisma.comedien.create({
    data: { companyId, prenom, nom },
    select: { id: true },
  });
  comedienCache.set(key, created.id);
  return created.id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("ProdBill — Import CSV Caleson");
  console.log("═".repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquante dans .env.local");
    process.exit(1);
  }

  // Récupérer la company et l'utilisateur admin
  const company = await prisma.company.findFirst({
    select: {
      id: true,
      name: true,
      defaultTauxCsComedien: true,
      defaultTauxCsTech: true,
      defaultTauxFg: true,
      defaultTauxMarge: true,
    },
  });
  if (!company) {
    console.error("❌ Aucune company trouvée en base.");
    process.exit(1);
  }
  const adminUser = await prisma.user.findFirst({
    where: { companyId: company.id },
    select: { id: true },
  });
  if (!adminUser) {
    console.error("❌ Aucun utilisateur trouvé.");
    process.exit(1);
  }

  console.log(`\n🏢 Company  : ${company.name}`);
  console.log(`📄 Fichier  : ${CSV_PATH}\n`);

  // Vérifier le CSV
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Fichier CSV introuvable : ${CSV_PATH}`);
    console.error("   Placez votre CSV à cet emplacement ou définissez CSV_PATH=<chemin>");
    process.exit(1);
  }

  // ── Purge ─────────────────────────────────────────────────────────────────
  await purgeBase();

  // ── Lecture CSV (latin1) ─────────────────────────────────────────────────
  const raw = fs.readFileSync(CSV_PATH, "latin1");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 1) {
    console.error("❌ CSV vide.");
    process.exit(1);
  }

  console.log(`📋 ${lines.length} lignes à importer\n`);

  // ── Import ligne par ligne ────────────────────────────────────────────────
  let nbImporte = 0;
  let nbSkip = 0;
  let nbErreur = 0;

  // Map numero → id pour les liens devis ↔ facture (peuplé au fur et à mesure)
  const devisNumeroToId = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const cols = parseCsvLine(lines[i]);

    const c = (idx: number) => cols[idx]?.trim() ?? "";

    const agence      = c(COL.AGENCE);
    const societe     = c(COL.SOCIETE);
    const annonceur   = c(COL.ANNONCEUR);
    const noDevis       = cleanNumero(c(COL.NO_DEVIS));
    const noFacture     = cleanNumero(c(COL.NO_FACTURE));
    const noDevisLie    = cleanNumero(c(COL.NO_DEVIS_LIE));
    const statutDevisTxt = c(COL.NO_FACTURE); // cols[5] : "DEVIS SIGN", "ANNUL", etc.
    const estFacture    = c(COL.FACTURE_01) === "1"; // cols[3] : "1" = devis facturé
    const statutPaie    = c(COL.STATUT_PAIEMENT);
    const dateRegl      = c(COL.DATE_REGLEMENT);
    const comedienNom = c(COL.COMEDIEN);
    const dateSeance1 = c(COL.DATE_SEANCE1);
    const annee       = parseInt(c(COL.ANNEE)) || new Date().getFullYear();

    // Montants : lus depuis les 4 dernières valeurs non vides
    // (les colonnes intermédiaires vides font varier les indices absolus)
    const nonEmpty = cols.filter((v) => {
      const t = v.trim();
      return t !== "" && !/^-\s*$/.test(t);
    });
    const totalHt  = parseAmount(nonEmpty[nonEmpty.length - 4]);
    const tva      = parseAmount(nonEmpty[nonEmpty.length - 3]);
    const totalTtc = parseAmount(nonEmpty[nonEmpty.length - 2]);

    // Client = Agence (index 1) — skip uniquement si vide
    const clientNom = agence;
    if (!clientNom) {
      console.log(`⏭  Ligne ${lineNum} — agence vide, skip`);
      nbSkip++;
      continue;
    }

    try {
      const clientId = await findOrCreateClient(clientNom, company.id);

      // ── Devis ──────────────────────────────────────────────────────────
      let devisId: string | null = null;

      if (noDevis && noDevis.toUpperCase() !== "ANNUL") {
        // Devis.numero n'a pas de contrainte @unique → findFirst + create/update
        const cachedDevisId = devisNumeroToId.get(noDevis);
        if (cachedDevisId) {
          devisId = cachedDevisId;
        } else {
          const devisData = {
            companyId: company.id,
            clientId,
            createdById: adminUser.id,
            numero: noDevis,
            objet: annonceur || agence || "Import CSV",
            statut: estFacture ? "ACCEPTE" : mapDevisStatut(statutDevisTxt),
            annee,
            dateEmission: parseDate(c(COL.DATE)),
            dateSeance: parseDate(dateSeance1),
            tauxCsComedien: company.defaultTauxCsComedien,
            tauxCsTech: company.defaultTauxCsTech,
            tauxFg: company.defaultTauxFg,
            tauxMarge: company.defaultTauxMarge,
            sousTotal: totalHt,
            totalHt,
            totalApresRemise: totalHt,
            tva: tva || Math.round(totalHt * 0.2 * 100) / 100,
            totalTtc: totalTtc || Math.round(totalHt * 1.2 * 100) / 100,
          };
          const existingInDb = await prisma.devis.findFirst({
            where: { companyId: company.id, numero: noDevis },
            select: { id: true },
          });
          let devis: { id: string };
          if (existingInDb) {
            devis = await prisma.devis.update({
              where: { id: existingInDb.id },
              data: devisData,
              select: { id: true },
            });
          } else {
            devis = await prisma.devis.create({
              data: devisData,
              select: { id: true },
            });
          }
          devisId = devis.id;
          devisNumeroToId.set(noDevis, devisId);
        }
      }

      // ── Comédien ───────────────────────────────────────────────────────
      if (comedienNom) {
        const comedienId = await findOrCreateComedien(comedienNom, company.id);
        // Associer au devis via une ligne si le devis existe
        if (devisId) {
          const sectionExists = await prisma.devisSection.findFirst({
            where: { devisId },
            select: { id: true },
          });
          if (!sectionExists) {
            await prisma.devisSection.create({
              data: {
                devisId,
                titre: "Artistes",
                ordre: 0,
                lignes: {
                  create: {
                    libelle: comedienNom,
                    tag: "ARTISTE",
                    quantite: 1,
                    prixUnit: 0,
                    total: 0,
                    tauxIndexation: 0,
                    ordre: 0,
                    comedienId,
                  },
                },
              },
            });
          }
        }
      }

      // ── Facture ────────────────────────────────────────────────────────
      // cols[5] peut contenir un statut texte ("DEVIS SIGN", "ANNUL") ou un vrai numéro
      const isRealFactureNumero = noFacture && /\d/.test(noFacture) && noFacture.toUpperCase() !== "ANNUL";
      if (isRealFactureNumero) {
        // Résolution du devis lié : N°DevisLié en priorité, puis N°Devis
        let factureDevisId = devisId;
        if (noDevisLie && noDevisLie !== noDevis) {
          factureDevisId = devisNumeroToId.get(noDevisLie) ?? null;
          if (!factureDevisId) {
            // Chercher en base (au cas où déjà importé depuis une autre ligne)
            const linked = await prisma.devis.findFirst({
              where: { companyId: company.id, numero: noDevisLie },
              select: { id: true },
            });
            factureDevisId = linked?.id ?? devisId;
          }
        }

        const factTva = tva || Math.round(totalHt * 0.2 * 100) / 100;
        const factTtc = totalTtc || Math.round(totalHt * 1.2 * 100) / 100;

        // Facture.numero est @unique → upsert standard
        const factureData = {
          companyId: company.id,
          clientId,
          devisId: factureDevisId,
          createdById: adminUser.id,
          type: mapFactureType(noFacture),
          statut: mapFactureStatut(statutPaie),
          totalHt,
          tva: factTva,
          totalTtc: factTtc,
          dateEmission: parseDate(c(COL.DATE)),
          dateReglement: parseDate(dateRegl),
          numeroBdc: null,
          siretEmetteur: "",
          tvaIntraEmetteur: "",
          ibanEmetteur: "",
          bicEmetteur: "",
          nomBanqueEmetteur: "",
          conditionsPaiement: "",
          nomEmetteur: "",
          adresseEmetteur: "",
        };
        await prisma.facture.upsert({
          where: { numero: noFacture },
          create: { numero: noFacture, ...factureData },
          update: factureData,
        });
      }

      const label = [noDevis, noFacture].filter(Boolean).join(" / ") || clientNom;
      console.log(`✅ Ligne ${lineNum} — ${label} (${clientNom})`);
      nbImporte++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌ Ligne ${lineNum} — ${noDevis || clientNom} — ${msg}`);
      nbErreur++;
    }
  }

  // ── Résumé ─────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log(
    `Résumé : ✅ ${nbImporte} importé(s)  ⏭  ${nbSkip} ignoré(s)  ❌ ${nbErreur} erreur(s)`
  );
  console.log("═".repeat(60) + "\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
