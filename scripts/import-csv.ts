/**
 * scripts/import-csv.ts
 * Purge la base puis importe le tableau de suivi Caleson (CSV latin1, séparé par ;).
 *
 * Usage : npx tsx scripts/import-csv.ts
 *         CSV_PATH=/chemin/vers/fichier.csv npx tsx scripts/import-csv.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import iconv from "iconv-lite";
import { parse as parseCsv } from "csv-parse/sync";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  PrismaClient,
  DevisStatut,
  FactureType,
  FactureStatut,
  LigneTag,
} from "@prisma/client";

dotenv.config({ path: ".env.local" });

const CSV_PATH =
  process.env.CSV_PATH ??
  "/Users/roselaine.touati/Desktop/Tableau de suivi pour ProdBill.csv";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── CSV parsing ──────────────────────────────────────────────────────────────

/**
 * Normalisation des noms d'en-têtes pour le matching.
 *
 * Le CSV Caleson a été produit par un éditeur Mac qui semble avoir partiellement
 * stripé les caractères accentués dans certains en-têtes (ex: "Numéro" devenu
 * "Numro", "Échéance" devenu "chance"). Pour matcher de façon robuste les noms
 * fournis dans le code avec ceux du fichier, on retire :
 *   - les diacritiques (NFD + suppression des combining marks)
 *   - mais AUSSI le caractère accentué entier (plages U+00C0–U+017F),
 *     pour tolérer la perte complète d'accents.
 *
 * Ainsi "Numéro DEVIS" et "Numro DEVIS" se normalisent tous deux en "numro devis".
 */
function normalizeHeader(s: string): string {
  return s
    // Supprime entièrement les lettres latines accentuées (Latin-1 Supplement
    // U+00C0–U+00FF hors × et ÷). Cela couvre à la fois le CSV original
    // ("Numéro") et la version avec accents perdus ("Numro") — les deux
    // donnent "numro" après normalisation.
    .replace(/[À-ÖØ-öø-ÿ]/g, "")
    .toLowerCase()
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIdx(headers: string[], name: string): number {
  const n = normalizeHeader(name);
  return headers.findIndex((h) => normalizeHeader(h) === n);
}

function findAllHeaderIdx(headers: string[], name: string): number[] {
  const n = normalizeHeader(name);
  const result: number[] = [];
  headers.forEach((h, i) => {
    if (normalizeHeader(h) === n) result.push(i);
  });
  return result;
}

// ─── Helpers parsing ──────────────────────────────────────────────────────────

function isEmptyValue(s?: string): boolean {
  if (!s) return true;
  const t = s.trim();
  return t === "" || /^-\s*$/.test(t);
}

function parseAmount(s?: string): number {
  if (isEmptyValue(s)) return 0;
  const cleaned = s!
    .replace(/[\s_]/g, "")
    .replace(/[Û€$£]/g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function cleanNumero(s?: string): string {
  if (!s) return "";
  return s.replace(/[^a-zA-Z0-9\- ]/g, "").trim();
}

function parseDate(s?: string): Date | null {
  if (isEmptyValue(s)) return null;
  const t = s!.trim();
  if (t === "?") return null;
  const parts = t.split("/");
  if (parts.length !== 3) return null;
  const j = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  let a = parseInt(parts[2], 10);
  if (isNaN(j) || isNaN(m) || isNaN(a)) return null;
  if (a < 100) a += 2000;
  const d = new Date(a, m - 1, j);
  return isNaN(d.getTime()) ? null : d;
}

function mapDevisStatut(noFacture: string, statut: string): DevisStatut {
  const f = (noFacture ?? "").toUpperCase().trim();
  const s = (statut ?? "").toUpperCase();
  if (f && f !== "A FAIRE" && f !== "ANNUL" && /\d/.test(f)) return "ACCEPTE";
  if (f === "ANNUL" || s.includes("ANNUL")) return "REFUSE";
  return "BROUILLON";
}

function mapFactureType(numero: string): FactureType {
  const u = numero.toUpperCase();
  if (u.startsWith("AV")) return "AVOIR";
  if (/-A\d/i.test(numero)) return "ACOMPTE";
  return "SOLDE";
}

function mapFactureStatut(raw: string): FactureStatut {
  const u = (raw ?? "").toUpperCase().trim();
  if (!u) return "EMISE";
  if (u.includes("NON")) return "EMISE"; // "non-pay" → non payée
  if (u.includes("PARTIEL")) return "PAYEE_PARTIEL";
  if (u.includes("PAY")) return "PAYEE";
  if (u.includes("RETARD")) return "EN_RETARD";
  if (u.includes("ANNUL")) return "ANNULEE";
  return "EMISE";
}

// ─── Sections et tags ─────────────────────────────────────────────────────────
//
// L'enum LigneTag du schéma ne contient que :
//   ARTISTE, TECHNICIEN_HCS, STUDIO, MUSIQUE, AGENT
//
// Les sections « Droits » et « Autres » demandées par l'utilisateur n'ont pas
// d'équivalent direct. Mapping pragmatique (sans impact sur les calculs CS) :
//   - Droits  → MUSIQUE (droits musicaux/SACEM, pas de CS appliquée)
//   - Autres  → STUDIO  (catégorie neutre, pas de CS appliquée)
// Le titre de section reste « Droits » / « Autres » côté UI.

type SectionCfg = {
  titre: string;
  tag: LigneTag;
  noms: string[];
};

const SECTIONS: SectionCfg[] = [
  {
    titre: "Voix-Off",
    tag: "ARTISTE",
    noms: [
      "Comédien | prestation",
      "Comédien | droits en intitulé",
      "Indexation annuelle artiste",
      "Artistes",
      "Agent Voix Off (10%)",
      "Casting voix-off",
    ],
  },
  {
    titre: "Studio",
    tag: "TECHNICIEN_HCS",
    noms: [
      "Studio Enregistrement | forfait heure",
      "Réalisation et Montage Voix IA",
      "Studio Enregistrement Sources Connect",
      "Studio Clean | forfait heure",
      "Studio Mixage | forfait heure",
      "Forfait Animatic et Montage Musique",
      "EDIT MUSIQUE",
      "Studio Mixage 5.1 | forfait heure",
      "Studio Réduction Stéréo",
      "Post-Producteur",
      "Ingénieur Son | hors cs",
      "Ingénieur Son - MUSIQUE",
      "Ingénieur Son - Montage",
      "Ingénieur Son - Mixage 5.1",
      "Réalisation | hors cs",
      "Gestion de production",
      "Sound Design| Forfait",
      "Fourniture et Sauvegarde",
      "EXPORT FICHIERS",
      "LIVRAISON REGIES RADIOS",
      "Sortie d'éléments/ forfait",
      "STUDIO DÉCLINAISON ADAPTATION",
    ],
  },
  {
    titre: "Musique",
    tag: "MUSIQUE",
    noms: [
      "Recherche Musicale",
      "Composition Originale Caleson",
      "Adaptations Musiques du passé / forfait",
      "Montage Musique",
      "Musique de librairie droits en intitulé",
      "Remise exceptionnelle musique",
      "Finalisation musique",
      "Finalisaton musique",
      "Programmateur Synthé",
      "Programmateur Synthe",
      "Supervision paroles",
      "Studio Musique",
      "Mixage Musique",
      "Mixeur Musque",
      "Additif Studio Musique",
      "Réalisation musique hors CS",
    ],
  },
  {
    titre: "Droits",
    tag: "MUSIQUE",
    noms: [
      "Droits Musique",
      "INDEXATION Droits Musique",
      "Droits Radio",
      "Droits Achat Espace A2",
      "indexation renouvellement A2",
      "SACEM",
    ],
  },
  {
    titre: "Autres",
    tag: "STUDIO",
    noms: [
      "Frais de communication / marketing",
      "Frais juridiques",
      "Frais de déplacement",
      "Conception et Rédaction Originale. REEL",
      "Conception et Rédaction Originale. DEVIS",
      "Vente materiel",
      "Loyer",
      "CO-PRODUCTION (APPORT EN INDUSTRIE SUR STUDIOS ET SALAIRES)",
      "REMISE EXCEPTIONNELLE",
    ],
  },
];

const EXCLUSIONS = new Set(
  [
    "Charges sociales comédien",
    "Charges sociales techniciens",
    "Frais généraux",
    "Marge de fonctionnement",
  ].map(normalizeHeader)
);

// ─── Purge ────────────────────────────────────────────────────────────────────

async function purgeBase() {
  console.log("\n🗑️  Suppression des données existantes...");
  // Tables dépendantes (FK non-cascade) — libérer avant de toucher aux entités principales.
  await prisma.paiement.deleteMany({});
  await prisma.relance.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.bDC.deleteMany({});
  await prisma.budgetLigne.deleteMany({});
  // Ordre demandé :
  await prisma.devisLigne.deleteMany({});
  await prisma.devisSection.deleteMany({});
  await prisma.facture.deleteMany({});
  await prisma.devis.deleteMany({});
  await prisma.comedien.deleteMany({});
  await prisma.client.deleteMany({});
  console.log("✅ Base nettoyée.\n");
}

// ─── Caches ───────────────────────────────────────────────────────────────────

const clientCache = new Map<string, string>();
const comedienCache = new Map<string, string>();

async function findOrCreateClient(nom: string, companyId: string): Promise<string> {
  const key = nom.trim().toLowerCase();
  const cached = clientCache.get(key);
  if (cached) return cached;
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

async function findOrCreateComedien(fullName: string, companyId: string): Promise<string> {
  const key = fullName.trim().toLowerCase();
  const cached = comedienCache.get(key);
  if (cached) return cached;
  const parts = fullName.trim().split(/\s+/);
  const prenom = parts[0] ?? "";
  const nom = parts.slice(1).join(" ") || prenom;
  const existing = await prisma.comedien.findFirst({
    where: {
      companyId,
      prenom: { equals: prenom, mode: "insensitive" },
      nom: { equals: nom, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    comedienCache.set(key, existing.id);
    return existing.id;
  }
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
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Fichier CSV introuvable : ${CSV_PATH}`);
    console.error("   Définissez CSV_PATH=<chemin> ou placez le CSV à cet emplacement.");
    process.exit(1);
  }

  // Cherche en priorité la company "Caleson" ; fallback sur la première.
  const allCompanies = await prisma.company.findMany({
    select: { id: true, name: true, clerkOrgId: true },
  });
  console.log(
    `\n🔎 ${allCompanies.length} company(ies) en base : ${allCompanies
      .map((c) => `"${c.name}" (${c.id})`)
      .join(", ")}`
  );
  const company =
    (await prisma.company.findFirst({
      where: { name: { contains: "Caleson", mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        defaultTauxCsComedien: true,
        defaultTauxCsTech: true,
        defaultTauxFg: true,
        defaultTauxMarge: true,
      },
    })) ??
    (await prisma.company.findFirst({
      select: {
        id: true,
        name: true,
        defaultTauxCsComedien: true,
        defaultTauxCsTech: true,
        defaultTauxFg: true,
        defaultTauxMarge: true,
      },
    }));
  if (!company) {
    console.error("❌ Aucune company trouvée.");
    process.exit(1);
  }
  console.log("Company ID:", company.id);
  if (!/caleson/i.test(company.name)) {
    console.log(
      `⚠️  La company sélectionnée ne s'appelle pas "Caleson" — vérifie que c'est bien celle attendue.`
    );
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

  await purgeBase();

  // Lecture en Mac Roman : le CSV a été produit par un éditeur Mac (bytes 0x8e,
  // 0x8f, 0x83… correspondent aux accents Mac Roman, pas latin1).
  const buf = fs.readFileSync(CSV_PATH);
  const raw = iconv.decode(buf, "macintosh");

  // Vrai parser CSV : gère les guillemets et les cellules multi-lignes
  // (descriptions entre " qui contiennent des \n).
  const rows: string[][] = parseCsv(raw, {
    delimiter: ";",
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: false, // on garde la numérotation fidèle
    bom: true,
  });

  if (rows.length < 2) {
    console.error("❌ CSV vide ou sans données.");
    process.exit(1);
  }
  const headers = rows[0].map((h) => (h ?? "").trim());

  // Index des colonnes métadonnées (par nom d'en-tête)
  const idx = {
    commercial:     findHeaderIdx(headers, "Nom du Commercial"),
    client:         findHeaderIdx(headers, "Client"),
    projet:         findHeaderIdx(headers, "Nom du Projet"),
    objet:          findHeaderIdx(headers, "Objet du devis"),
    description:    findHeaderIdx(headers, "Description du projet"),
    pipe:           findHeaderIdx(headers, "PIPE DEVIS %"),
    noDevis:        findHeaderIdx(headers, "Numéro DEVIS"),
    noBdc:          findHeaderIdx(headers, "Numéro de BDC"),
    noFacture:      findHeaderIdx(headers, "Numéro Facture"),
    annee:          findHeaderIdx(headers, "Année"),
    dateEmission:   findHeaderIdx(headers, "Date émission"),
    echeance:       findHeaderIdx(headers, "Échéance"),
    statut:         findHeaderIdx(headers, "Statut"),
    datePaiement:   findHeaderIdx(headers, "Date paiement"),
    nomComedien:    findHeaderIdx(headers, "Nom Comédien"),
    statutCachet:   findHeaderIdx(headers, "Statut cachet comédien"),
    agent:          findHeaderIdx(headers, "Agent"),
    dateReglPresta: findHeaderIdx(headers, "Date du règlement de la prestation"),
    dateReglDroits: findHeaderIdx(headers, "Date du règlement des droits"),
    totalHt:        findHeaderIdx(headers, "TOTAL HT"),
    ht:             findHeaderIdx(headers, "HT (Û)"),
    tva:            findHeaderIdx(headers, "TVA (Û)"),
    ttc:            findHeaderIdx(headers, "TTC (Û)"),
  };

  // Pré-calcul des index pour chaque section (avec gestion des doublons d'en-têtes)
  const sectionColumns = SECTIONS.map((sec) => {
    const colonnes: Array<{ libelle: string; idx: number }> = [];
    for (const nom of sec.noms) {
      const indices = findAllHeaderIdx(headers, nom);
      for (const i of indices) {
        colonnes.push({ libelle: headers[i].trim() || nom, idx: i });
      }
    }
    return { titre: sec.titre, tag: sec.tag, colonnes };
  });

  // Colonnes non mappées (info uniquement)
  const mapped = new Set<number>();
  for (const s of sectionColumns) for (const c of s.colonnes) mapped.add(c.idx);
  for (const k of Object.values(idx)) if (k >= 0) mapped.add(k);
  const unmapped: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    if (mapped.has(i)) continue;
    if (EXCLUSIONS.has(normalizeHeader(h))) continue;
    unmapped.push(`#${i}:"${h}"`);
  }
  if (unmapped.length > 0) {
    console.log(`ℹ️  Colonnes ignorées (non mappées, hors exclusions) : ${unmapped.join(", ")}\n`);
  }

  // Ligne « vide » = toutes les colonnes vides (après trim).
  const isBlankRow = (r: string[]) =>
    r.every((c) => (c ?? "").trim() === "");

  const dataRows = rows.slice(1);
  console.log(`📋 ${dataRows.length} ligne(s) brutes après l'en-tête\n`);

  let nbImporte = 0;
  let nbSkip = 0;
  let nbErreur = 0;
  let firstDevisLogged = false;
  const devisNumeroToId = new Map<string, string>();

  for (let i = 0; i < dataRows.length; i++) {
    const lineNum = i + 2; // +1 pour l'en-tête, +1 pour passer en base 1
    const cols = dataRows[i];

    // Arrêt immédiat dès la première ligne entièrement vide.
    if (isBlankRow(cols)) {
      console.log(`\n🛑 Ligne ${lineNum} vide — arrêt de la boucle.\n`);
      break;
    }

    const get = (k: number) => (k >= 0 ? (cols[k] ?? "").trim() : "");

    const clientNom = get(idx.client);
    if (!clientNom) {
      console.log(`⚠️  Ligne ${lineNum} skippée (client vide)`);
      nbSkip++;
      continue;
    }

    const noDevis = cleanNumero(get(idx.noDevis));
    const noFacture = cleanNumero(get(idx.noFacture));
    const noBdc = cleanNumero(get(idx.noBdc));

    const totalHt = parseAmount(get(idx.totalHt)) || parseAmount(get(idx.ht));
    const tva = parseAmount(get(idx.tva));
    const totalTtc = parseAmount(get(idx.ttc));

    try {
      const clientId = await findOrCreateClient(clientNom, company.id);

      // ── DEVIS ─────────────────────────────────────────────────────────
      let devisId: string | null = null;
      if (noDevis && noDevis.toUpperCase() !== "ANNUL") {
        const cached = devisNumeroToId.get(noDevis);
        if (cached) {
          devisId = cached;
        } else {
          const projet = get(idx.projet);
          const objet = get(idx.objet) || projet || "Import CSV";
          const description = get(idx.description) || null;
          const dateEmiss = parseDate(get(idx.dateEmission));
          const anneeVal =
            parseInt(get(idx.annee)) ||
            dateEmiss?.getFullYear() ||
            new Date().getFullYear();
          const pipeRaw = get(idx.pipe).replace(",", ".").replace("%", "").trim();
          const pipeNum = pipeRaw ? parseFloat(pipeRaw) : NaN;
          const pipe = !isNaN(pipeNum)
            ? Math.max(0, Math.min(100, Math.round(pipeNum <= 1 ? pipeNum * 100 : pipeNum)))
            : null;

          const devisData = {
            companyId: company.id,
            clientId,
            createdById: adminUser.id,
            numero: noDevis,
            objet,
            description,
            nomProjet: projet || null,
            annee: anneeVal,
            statut: mapDevisStatut(noFacture, get(idx.statut)),
            tauxCsComedien: company.defaultTauxCsComedien,
            tauxCsTech: company.defaultTauxCsTech,
            tauxFg: company.defaultTauxFg,
            tauxMarge: company.defaultTauxMarge,
            sousTotal: totalHt,
            totalHt,
            totalApresRemise: totalHt,
            tva: tva || Math.round(totalHt * 0.2 * 100) / 100,
            totalTtc: totalTtc || Math.round(totalHt * 1.2 * 100) / 100,
            dateEmission: dateEmiss,
            tauxPipe: pipe,
          };

          const existing = await prisma.devis.findFirst({
            where: { companyId: company.id, numero: noDevis },
            select: { id: true },
          });
          const devis = existing
            ? await prisma.devis.update({
                where: { id: existing.id },
                data: devisData,
                select: { id: true },
              })
            : await prisma.devis.create({
                data: devisData,
                select: { id: true },
              });
          devisId = devis.id;
          devisNumeroToId.set(noDevis, devisId);

          if (!firstDevisLogged) {
            const check = await prisma.devis.findUnique({
              where: { id: devisId },
              select: { id: true, numero: true, companyId: true, clientId: true },
            });
            console.log(
              `🔍 Premier devis créé — id=${check?.id} numero=${check?.numero} companyId=${check?.companyId} clientId=${check?.clientId}`
            );
            firstDevisLogged = true;
          }

          // Sections & lignes — rebuild propre (delete-then-create)
          await prisma.devisSection.deleteMany({ where: { devisId } });
          let ordreSection = 0;
          for (const sec of sectionColumns) {
            const lignes: Array<{
              libelle: string;
              tag: LigneTag;
              prixUnit: number;
            }> = [];
            for (const col of sec.colonnes) {
              const v = parseAmount(cols[col.idx]);
              if (v !== 0) {
                lignes.push({ libelle: col.libelle, tag: sec.tag, prixUnit: v });
              }
            }
            if (lignes.length > 0) {
              await prisma.devisSection.create({
                data: {
                  devisId,
                  titre: sec.titre,
                  ordre: ordreSection++,
                  lignes: {
                    create: lignes.map((l, k) => ({
                      libelle: l.libelle,
                      tag: l.tag,
                      quantite: 1,
                      prixUnit: l.prixUnit,
                      total: l.prixUnit,
                      tauxIndexation: 0,
                      ordre: k,
                    })),
                  },
                },
              });
            }
          }
        }
      }

      // ── COMÉDIEN ──────────────────────────────────────────────────────
      const comedienNom = get(idx.nomComedien);
      if (comedienNom && !["-", "?"].includes(comedienNom)) {
        const comedienId = await findOrCreateComedien(comedienNom, company.id);
        if (devisId) {
          // Associer au premier ligne ARTISTE du devis (sans comédien encore)
          const ligne = await prisma.devisLigne.findFirst({
            where: { section: { devisId }, tag: "ARTISTE", comedienId: null },
            select: { id: true },
          });
          if (ligne) {
            await prisma.devisLigne.update({
              where: { id: ligne.id },
              data: { comedienId },
            });
          }
        }
      }

      // ── FACTURE ───────────────────────────────────────────────────────
      const fU = noFacture.toUpperCase();
      const factureValide =
        noFacture && fU !== "A FAIRE" && fU !== "ANNUL" && /\d/.test(noFacture);

      if (factureValide) {
        const statutRaw = get(idx.statut);
        const datePaie = parseDate(get(idx.datePaiement));
        const dateEmiss = parseDate(get(idx.dateEmission));
        const dateRegl = parseDate(get(idx.dateReglPresta)) || datePaie;
        const factureData = {
          companyId: company.id,
          clientId,
          devisId,
          createdById: adminUser.id,
          type: mapFactureType(noFacture),
          statut: mapFactureStatut(statutRaw),
          totalHt,
          tva: tva || Math.round(totalHt * 0.2 * 100) / 100,
          totalTtc: totalTtc || Math.round(totalHt * 1.2 * 100) / 100,
          dateEmission: dateEmiss,
          dateReglement: dateRegl,
          datePaiement: datePaie,
          numeroBdc: noBdc || null,
        };
        await prisma.facture.upsert({
          where: { numero: noFacture },
          create: { numero: noFacture, ...factureData },
          update: factureData,
        });
      }

      const label = [noDevis, noFacture].filter(Boolean).join(" / ") || clientNom;
      console.log(`✅ Ligne ${lineNum} importée — ${label} (${clientNom})`);
      nbImporte++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `❌ Ligne ${lineNum} erreur — ${noDevis || noFacture || clientNom} — ${msg}`
      );
      nbErreur++;
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log(
    `Résumé : ✅ ${nbImporte} importé(s)   ⚠️  ${nbSkip} skippé(s)   ❌ ${nbErreur} erreur(s)`
  );
  console.log("═".repeat(60) + "\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
