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
    // Supprime les symboles monétaires : iconv-lite décode Mac Roman 0xDB
    // en ¤ (U+00A4) alors qu'on s'attendrait à €. Strip les deux + les usuels.
    .replace(/[€¤$£¥]/g, "")
    .toLowerCase()
    .replace(/[|()]/g, " ")
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
  const s = (statut ?? "").toUpperCase().trim();
  // Annulation prioritaire
  if (f === "ANNUL" || s.includes("ANNUL")) return "REFUSE";
  // Devis signé : soit la facture existe (numéro réel), soit elle est planifiée
  // ("A FAIRE" = client a signé, on attend juste de facturer).
  if (f === "A FAIRE") return "ACCEPTE";
  if (f && /\d/.test(f)) return "ACCEPTE";
  // Sinon : brouillon
  return "BROUILLON";
}

// Comédien « fantôme » : nom vide, ou contenant uniquement des tirets,
// points d'interrogation ou espaces. À ignorer pendant l'import.
function isComedienFantome(nom?: string): boolean {
  if (!nom) return true;
  const t = nom.trim();
  if (t === "") return true;
  return /^[\s\-–—?]*$/.test(t);
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
      // "CO-PRODUCTION (APPORT EN INDUSTRIE...)" et "REMISE EXCEPTIONNELLE"
      // ne sont PAS des lignes de prestation : elles représentent des montants
      // déductibles. Voir idx.coproduction / idx.remise + champs dédiés sur
      // Devis (remise, coproduction) et Facture (remise, coproduction).
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
  const companySelect = {
    id: true,
    name: true,
    siret: true,
    tvaIntra: true,
    address: true,
    city: true,
    postalCode: true,
    iban: true,
    bic: true,
    nomBanque: true,
    conditionsPaiement: true,
    defaultTauxCsComedien: true,
    defaultTauxCsTech: true,
    defaultTauxFg: true,
    defaultTauxMarge: true,
  } as const;
  const company =
    (await prisma.company.findFirst({
      where: { name: { contains: "Caleson", mode: "insensitive" } },
      select: companySelect,
    })) ??
    (await prisma.company.findFirst({ select: companySelect }));
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
    ht:             findHeaderIdx(headers, "HT (€)"),
    tva:            findHeaderIdx(headers, "TVA (€)"),
    ttc:            findHeaderIdx(headers, "TTC (€)"),
    csComedien:     findHeaderIdx(headers, "Charges sociales comédien"),
    csTech:         findHeaderIdx(headers, "Charges sociales techniciens"),
    fraisGeneraux:  findHeaderIdx(headers, "Frais généraux"),
    marge:          findHeaderIdx(headers, "Marge de fonctionnement"),
    coproduction:   findHeaderIdx(headers, "CO-PRODUCTION (APPORT EN INDUSTRIE SUR STUDIOS ET SALAIRES)"),
    remise:         findHeaderIdx(headers, "REMISE EXCEPTIONNELLE"),
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

  // ── Pré-agrégation des totaux par numéro de devis ─────────────────────────
  // Le CSV peut contenir plusieurs lignes pour un même devis (cas multi-
  // comédiens). Les totaux HT (€) / TVA (€) / TTC (€) du devis doivent être
  // la SOMME des colonnes correspondantes sur toutes les lignes partageant
  // le même Numéro DEVIS. Les lignes de section sont elles aussi cumulées.
  type DevisAgreg = {
    totalHt: number;
    tva: number;
    totalTtc: number;
    csComedien: number;
    csTechniciens: number;
    fraisGeneraux: number;
    marge: number;
    coproduction: number;
    remise: number;
    rowIdxs: number[];
  };
  const devisAgreg = new Map<string, DevisAgreg>();
  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    if (isBlankRow(cols)) break;
    const noDevisRaw = cleanNumero(
      idx.noDevis >= 0 ? (cols[idx.noDevis] ?? "").trim() : ""
    );
    if (!noDevisRaw || noDevisRaw.toUpperCase() === "ANNUL") continue;
    const ht =
      (idx.ht >= 0 ? parseAmount(cols[idx.ht]) : 0) ||
      (idx.totalHt >= 0 ? parseAmount(cols[idx.totalHt]) : 0);
    const tva = idx.tva >= 0 ? parseAmount(cols[idx.tva]) : 0;
    const ttc = idx.ttc >= 0 ? parseAmount(cols[idx.ttc]) : 0;
    const csCom  = idx.csComedien    >= 0 ? parseAmount(cols[idx.csComedien])    : 0;
    const csTech = idx.csTech        >= 0 ? parseAmount(cols[idx.csTech])        : 0;
    const fg     = idx.fraisGeneraux >= 0 ? parseAmount(cols[idx.fraisGeneraux]) : 0;
    const m      = idx.marge         >= 0 ? parseAmount(cols[idx.marge])         : 0;
    // Caleson stocke parfois ces deux montants en positif, parfois en
    // négatif (ex : 26029 = +148.05, 26007 = -108). Dans les deux cas
    // c'est |valeur| qui se déduit du HT. On normalise en absolu.
    const cop    = idx.coproduction  >= 0 ? Math.abs(parseAmount(cols[idx.coproduction]))  : 0;
    const rem    = idx.remise        >= 0 ? Math.abs(parseAmount(cols[idx.remise]))        : 0;
    const cur =
      devisAgreg.get(noDevisRaw) ?? {
        totalHt: 0, tva: 0, totalTtc: 0,
        csComedien: 0, csTechniciens: 0, fraisGeneraux: 0, marge: 0,
        coproduction: 0, remise: 0,
        rowIdxs: [],
      };
    cur.totalHt += ht;
    cur.tva += tva;
    cur.totalTtc += ttc;
    cur.csComedien    += csCom;
    cur.csTechniciens += csTech;
    cur.fraisGeneraux += fg;
    cur.marge         += m;
    cur.coproduction  += cop;
    cur.remise        += rem;
    cur.rowIdxs.push(i);
    devisAgreg.set(noDevisRaw, cur);
  }
  const nbMulti = Array.from(devisAgreg.values()).filter((a) => a.rowIdxs.length > 1).length;
  console.log(
    `🔁 ${devisAgreg.size} devis distincts (dont ${nbMulti} multi-lignes) — totaux pré-agrégés sur HT/TVA/TTC (€)`
  );

  // ── Pré-agrégation des totaux par numéro de facture ───────────────────────
  // Même logique que pour les devis : plusieurs lignes CSV peuvent porter le
  // même Numéro Facture (cas multi-comédiens). Les métadonnées (dates,
  // statut, client, devis lié) sont identiques sur toutes les lignes du
  // groupe — on prend la première. Les totaux HT/TVA/TTC sont sommés.
  type FactureAgreg = {
    totalHt: number;
    tva: number;
    totalTtc: number;
    rowIdxs: number[];
  };
  const factureAgreg = new Map<string, FactureAgreg>();
  for (let i = 0; i < dataRows.length; i++) {
    const cols = dataRows[i];
    if (isBlankRow(cols)) break;
    const noFactRaw = cleanNumero(
      idx.noFacture >= 0 ? (cols[idx.noFacture] ?? "").trim() : ""
    );
    if (!noFactRaw) continue;
    const u = noFactRaw.toUpperCase();
    if (u === "A FAIRE" || u === "ANNUL" || !/\d/.test(noFactRaw)) continue;
    const ht =
      (idx.ht >= 0 ? parseAmount(cols[idx.ht]) : 0) ||
      (idx.totalHt >= 0 ? parseAmount(cols[idx.totalHt]) : 0);
    const tva = idx.tva >= 0 ? parseAmount(cols[idx.tva]) : 0;
    const ttc = idx.ttc >= 0 ? parseAmount(cols[idx.ttc]) : 0;
    const cur =
      factureAgreg.get(noFactRaw) ?? { totalHt: 0, tva: 0, totalTtc: 0, rowIdxs: [] };
    cur.totalHt += ht;
    cur.tva += tva;
    cur.totalTtc += ttc;
    cur.rowIdxs.push(i);
    factureAgreg.set(noFactRaw, cur);
  }
  const nbFactMulti = Array.from(factureAgreg.values()).filter((a) => a.rowIdxs.length > 1).length;
  console.log(
    `🧾 ${factureAgreg.size} factures distinctes (dont ${nbFactMulti} multi-lignes) — totaux pré-agrégés sur HT/TVA/TTC (€)\n`
  );

  let nbImporte = 0;
  let nbSkip = 0;
  let nbErreur = 0;
  let firstDevisLogged = false;
  // Cache enrichi : id + breakdown du devis pour pouvoir snapshot
  // les CS/FG/Marge sur la facture (au prorata pour les acomptes).
  type DevisSnapshot = {
    id: string;
    sousTotal: number;
    csComedien: number;
    csTechniciens: number;
    baseMarge: number;
    fraisGeneraux: number;
    marge: number;
    remise: number;
    coproduction: number;
    totalHt: number;
    tauxCsComedien: number;
    tauxCsTech: number;
    tauxFg: number;
    tauxMarge: number;
  };
  const devisNumeroToData = new Map<string, DevisSnapshot>();
  const factureNumeroProcessed = new Set<string>();

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
    // BDC : on n'accepte que les vrais numéros (au moins un chiffre). La
    // colonne contient parfois du texte type "DEVIS SIGN", "ANNUL", "A FAIRE"
    // qui doit être ignoré et stocké en null.
    const noBdcRaw = cleanNumero(get(idx.noBdc));
    const noBdc = noBdcRaw && /\d/.test(noBdcRaw) ? noBdcRaw : "";

    // Montants par-ligne (utilisés pour la FACTURE, qui correspond 1:1 à la ligne CSV).
    // Source : col "HT (€)" (= HT après remise/co-prod), pas col "TOTAL HT" (brut).
    const rowHt = parseAmount(get(idx.ht)) || parseAmount(get(idx.totalHt));
    const rowTva = parseAmount(get(idx.tva));
    const rowTtc = parseAmount(get(idx.ttc));

    try {
      const clientId = await findOrCreateClient(clientNom, company.id);

      // ── DEVIS ─────────────────────────────────────────────────────────
      let devisId: string | null = null;
      if (noDevis && noDevis.toUpperCase() !== "ANNUL") {
        const cached = devisNumeroToData.get(noDevis);
        if (cached) {
          devisId = cached.id;
        } else {
          // Totaux agrégés : somme sur toutes les lignes CSV du même devis.
          const aggreg = devisAgreg.get(noDevis);
          const devisHt = aggreg?.totalHt ?? rowHt;
          const devisTva = aggreg?.tva ?? rowTva;
          const devisTtc = aggreg?.totalTtc ?? rowTtc;
          const devisRowIdxs = aggreg?.rowIdxs ?? [i];
          const csComedien    = aggreg?.csComedien    ?? 0;
          const csTechniciens = aggreg?.csTechniciens ?? 0;
          const fraisGeneraux = aggreg?.fraisGeneraux ?? 0;
          const margeAgr      = aggreg?.marge         ?? 0;
          const coproduction  = aggreg?.coproduction  ?? 0;
          const remiseAgr     = aggreg?.remise        ?? 0;

          // Pré-construction des lignes (en mémoire) pour pouvoir calculer
          // sousTotal = Σ (quantite × prixUnit) AVANT de créer le devis.
          // Les lignes représentent uniquement les prestations brutes —
          // CS/FG/marge sont stockés séparément sur le Devis, pas comme lignes.
          type LigneDraft = { libelle: string; tag: LigneTag; prixUnit: number };
          const sectionsDraft: Array<{
            titre: string;
            ordre: number;
            lignes: LigneDraft[];
          }> = [];
          let ordreSection = 0;
          for (const sec of sectionColumns) {
            const lignes: LigneDraft[] = [];
            for (const rowIdx of devisRowIdxs) {
              const rowCols = dataRows[rowIdx];
              for (const col of sec.colonnes) {
                const v = parseAmount(rowCols[col.idx]);
                if (v !== 0) {
                  lignes.push({ libelle: col.libelle, tag: sec.tag, prixUnit: v });
                }
              }
            }
            if (lignes.length > 0) {
              sectionsDraft.push({ titre: sec.titre, ordre: ordreSection++, lignes });
            }
          }
          const sousTotal = Math.round(
            sectionsDraft.reduce(
              (acc, s) => acc + s.lignes.reduce((a, l) => a + l.prixUnit, 0),
              0
            ) * 100
          ) / 100;
          const baseMarge = Math.round((sousTotal + csTechniciens) * 100) / 100;

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
            // Snapshot des taux Company (gardé pour l'UI/PDF, même si on
            // n'applique PAS la formule — les montants viennent du CSV brut).
            tauxCsComedien: company.defaultTauxCsComedien,
            tauxCsTech: company.defaultTauxCsTech,
            tauxFg: company.defaultTauxFg,
            tauxMarge: company.defaultTauxMarge,
            // Montants : sousTotal = prestations brutes, le reste vient du CSV
            // tel quel (Caleson n'applique pas toujours les taux uniformément).
            sousTotal,
            csComedien,
            csTechniciens,
            baseMarge,
            fraisGeneraux,
            marge: margeAgr,
            remise: remiseAgr,
            coproduction,
            totalHt: devisHt,
            totalApresRemise: devisHt,
            tva: devisTva || Math.round(devisHt * 0.2 * 100) / 100,
            tauxTva:
              devisHt > 0 && devisTva > 0
                ? Math.round((devisTva / devisHt) * 100 * 100) / 100
                : 20,
            totalTtc: devisTtc || Math.round(devisHt * 1.2 * 100) / 100,
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
          devisNumeroToData.set(noDevis, {
            id: devis.id,
            sousTotal,
            csComedien,
            csTechniciens,
            baseMarge,
            fraisGeneraux,
            marge: margeAgr,
            remise: remiseAgr,
            coproduction,
            totalHt: devisHt,
            tauxCsComedien: company.defaultTauxCsComedien,
            tauxCsTech: company.defaultTauxCsTech,
            tauxFg: company.defaultTauxFg,
            tauxMarge: company.defaultTauxMarge,
          });

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

          // Persistance des sections & lignes pré-construites en mémoire.
          // Phase 1 multi-tenant : companyId injecté sur les 2 nested levels.
          await prisma.devisSection.deleteMany({ where: { devisId } });
          for (const sec of sectionsDraft) {
            await prisma.devisSection.create({
              data: {
                companyId: company.id,
                devisId,
                titre: sec.titre,
                ordre: sec.ordre,
                lignes: {
                  create: sec.lignes.map((l, k) => ({
                    companyId: company.id,
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

      // ── COMÉDIEN ──────────────────────────────────────────────────────
      const comedienNom = get(idx.nomComedien);
      if (!isComedienFantome(comedienNom)) {
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
      // Une facture = un Numéro Facture unique. Les lignes CSV partageant le
      // même numéro sont agrégées (HT/TVA/TTC sommés ; métadonnées de la 1ʳᵉ
      // ligne du groupe, identiques sur toutes les autres).
      const fU = noFacture.toUpperCase();
      const factureValide =
        noFacture && fU !== "A FAIRE" && fU !== "ANNUL" && /\d/.test(noFacture);

      if (factureValide && !factureNumeroProcessed.has(noFacture)) {
        factureNumeroProcessed.add(noFacture);
        const aggregF = factureAgreg.get(noFacture);
        const factHt = aggregF?.totalHt ?? rowHt;
        const factTva = aggregF?.tva ?? rowTva;
        const factTtc = aggregF?.totalTtc ?? rowTtc;

        // Snapshot du breakdown du devis lié, ramené au prorata du montant facturé.
        // Ratio basé sur totalHt (plus stable que TTC à cause des arrondis TVA).
        const devisSnap = devisId ? devisNumeroToData.get(noDevis) : null;
        const ratio =
          devisSnap && devisSnap.totalHt > 0 ? factHt / devisSnap.totalHt : 0;
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const factBreakdown = devisSnap
          ? {
              sousTotal:      r2(devisSnap.sousTotal     * ratio),
              csComedien:     r2(devisSnap.csComedien    * ratio),
              csTechniciens:  r2(devisSnap.csTechniciens * ratio),
              fraisGeneraux:  r2(devisSnap.fraisGeneraux * ratio),
              marge:          r2(devisSnap.marge         * ratio),
              remise:         r2(devisSnap.remise        * ratio),
              coproduction:   r2(devisSnap.coproduction  * ratio),
              tauxCsComedien: devisSnap.tauxCsComedien,
              tauxCsTech:     devisSnap.tauxCsTech,
              tauxFg:         devisSnap.tauxFg,
              tauxMarge:      devisSnap.tauxMarge,
            }
          : null;
        const factBaseMarge = factBreakdown
          ? r2(factBreakdown.sousTotal + factBreakdown.csTechniciens)
          : 0;

        const statutRaw = get(idx.statut);
        const datePaie = parseDate(get(idx.datePaiement));
        const dateEmiss = parseDate(get(idx.dateEmission));
        // dateReglement = colonne "Date paiement" du CSV (col 13). On NE prend
        // PAS "Date du règlement de la prestation" (col 17) qui correspond au
        // règlement des cachets comédiens et non au règlement de la facture.
        const dateRegl = datePaie;
        const adresseEmetteur = [
          company.address,
          [company.postalCode, company.city].filter(Boolean).join(" "),
        ]
          .filter(Boolean)
          .join("\n");
        const factureData = {
          companyId: company.id,
          clientId,
          devisId,
          createdById: adminUser.id,
          type: mapFactureType(noFacture),
          statut: mapFactureStatut(statutRaw),
          totalHt: factHt,
          tva: factTva || Math.round(factHt * 0.2 * 100) / 100,
          // Calcul du taux réel depuis les montants CSV : permet de gérer
          // SACEM (10 %), alimentation (5,5 %), etc. Fallback 20 % si la
          // facture n'a pas de TVA renseignée (cas rares ou exports).
          tauxTva:
            factHt > 0 && factTva > 0
              ? Math.round((factTva / factHt) * 100 * 100) / 100
              : 20,
          totalTtc: factTtc || Math.round(factHt * 1.2 * 100) / 100,
          dateEmission: dateEmiss,
          dateReglement: dateRegl,
          datePaiement: datePaie,
          numeroBdc: noBdc || null,
          // Snapshot des coordonnées émetteur (immuabilité légale L441-9)
          nomEmetteur: company.name,
          adresseEmetteur,
          siretEmetteur: company.siret,
          tvaIntraEmetteur: company.tvaIntra,
          ibanEmetteur: company.iban,
          bicEmetteur: company.bic,
          nomBanqueEmetteur: company.nomBanque,
          conditionsPaiement: company.conditionsPaiement,
          // Breakdown ramené au prorata depuis le devis lié
          sousTotal:      factBreakdown?.sousTotal      ?? 0,
          csComedien:     factBreakdown?.csComedien     ?? 0,
          csTechniciens:  factBreakdown?.csTechniciens  ?? 0,
          baseMarge:      factBaseMarge,
          fraisGeneraux:  factBreakdown?.fraisGeneraux  ?? 0,
          marge:          factBreakdown?.marge          ?? 0,
          remise:         factBreakdown?.remise         ?? 0,
          coproduction:   factBreakdown?.coproduction   ?? 0,
          tauxCsComedien: factBreakdown?.tauxCsComedien ?? 0,
          tauxCsTech:     factBreakdown?.tauxCsTech     ?? 0,
          tauxFg:         factBreakdown?.tauxFg         ?? 0,
          tauxMarge:      factBreakdown?.tauxMarge      ?? 0,
        };
        // Phase 1 multi-tenant : numero est désormais unique scopé par tenant
        // via @@unique([companyId, numero]). On utilise la clé composée.
        await prisma.facture.upsert({
          where: { companyId_numero: { companyId: company.id, numero: noFacture } },
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

  // ── Nettoyage des Comédiens fantômes encore en base ──────────────────────
  // Sécurité : on supprime ceux dont le nom matche le pattern et qui ne sont
  // liés à aucune ligne de devis. Les fantômes liés (cas anormal) sont loggés.
  const allComediens = await prisma.comedien.findMany({
    where: { companyId: company.id },
    select: { id: true, prenom: true, nom: true, _count: { select: { lignes: true } } },
  });
  const fantomes = allComediens.filter((c) =>
    isComedienFantome(`${c.prenom} ${c.nom}`.trim())
  );
  let nbFantSupp = 0;
  let nbFantOrph = 0;
  for (const f of fantomes) {
    if (f._count.lignes > 0) {
      console.log(
        `⚠️  Comédien fantôme "${f.prenom} ${f.nom}" lié à ${f._count.lignes} ligne(s) — conservé.`
      );
      nbFantOrph++;
    } else {
      await prisma.comedien.delete({ where: { id: f.id } });
      nbFantSupp++;
    }
  }
  if (fantomes.length > 0) {
    console.log(`🧹 Comédiens fantômes : ${nbFantSupp} supprimé(s), ${nbFantOrph} conservé(s) car liés.\n`);
  } else {
    console.log("🧹 Aucun comédien fantôme détecté en base.\n");
  }

  // ── Statistiques finales ─────────────────────────────────────────────────
  const [devisBrouillon, devisAccepte, devisRefuse, devisEnvoye, devisExpire] = await Promise.all([
    prisma.devis.count({ where: { companyId: company.id, statut: "BROUILLON" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "ACCEPTE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "REFUSE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "ENVOYE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "EXPIRE" } }),
  ]);
  const [factPayee, factEmise, factPartielle, factRetard, factAnnulee, factBrouillon] = await Promise.all([
    prisma.facture.count({ where: { companyId: company.id, statut: "PAYEE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "EMISE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "PAYEE_PARTIEL" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "EN_RETARD" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "ANNULEE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "BROUILLON" } }),
  ]);
  const nbComediens = await prisma.comedien.count({ where: { companyId: company.id } });

  console.log("📊 Statistiques finales");
  console.log("─".repeat(60));
  console.log("Devis :");
  console.log(`  • BROUILLON : ${devisBrouillon}`);
  console.log(`  • ACCEPTE   : ${devisAccepte}`);
  console.log(`  • REFUSE    : ${devisRefuse}`);
  if (devisEnvoye) console.log(`  • ENVOYE    : ${devisEnvoye}`);
  if (devisExpire) console.log(`  • EXPIRE    : ${devisExpire}`);
  console.log("Factures :");
  console.log(`  • PAYEE          : ${factPayee}`);
  console.log(`  • EMISE          : ${factEmise}`);
  if (factPartielle) console.log(`  • PAYEE_PARTIEL  : ${factPartielle}`);
  if (factRetard)    console.log(`  • EN_RETARD      : ${factRetard}`);
  if (factAnnulee)   console.log(`  • ANNULEE        : ${factAnnulee}`);
  if (factBrouillon) console.log(`  • BROUILLON      : ${factBrouillon}`);
  console.log(`Comédiens : ${nbComediens} en base`);
  console.log("─".repeat(60) + "\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
