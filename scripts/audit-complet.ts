/**
 * scripts/audit-complet.ts
 * Rapport global structuré : comptages, cohérence montants, anomalies, distribution.
 *
 * Usage : npx tsx scripts/audit-complet.ts
 */

import * as dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Formatage ────────────────────────────────────────────────────────────────

const C_CYAN = "\x1b[36m";
const C_GRAY = "\x1b[90m";
const C_BOLD = "\x1b[1m";
const C_DIM = "\x1b[2m";
const C_YELLOW = "\x1b[33m";
const C_RED = "\x1b[31m";
const C_RESET = "\x1b[0m";

const MOIS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function fmtEuros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function bar(width = 70): string {
  return "─".repeat(width);
}

function section(letter: string, titre: string) {
  console.log();
  console.log(C_CYAN + C_BOLD + "═".repeat(76) + C_RESET);
  console.log(`${C_CYAN}${C_BOLD}  SECTION ${letter} — ${titre}${C_RESET}`);
  console.log(C_CYAN + C_BOLD + "═".repeat(76) + C_RESET);
}

function sub(label: string) {
  console.log();
  console.log(`${C_BOLD}▸ ${label}${C_RESET}`);
  console.log(C_GRAY + bar() + C_RESET);
}

function kv(label: string, value: string | number, w = 32) {
  const v = typeof value === "number" ? fmtInt(value) : value;
  console.log(`  ${label.padEnd(w)} ${C_BOLD}${v}${C_RESET}`);
}

function kvEuro(label: string, value: number, w = 32) {
  console.log(`  ${label.padEnd(w)} ${C_BOLD}${fmtEuros(value).padStart(16)}${C_RESET}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquante.");
    process.exit(1);
  }

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) {
    console.error("❌ Aucune company en base.");
    process.exit(1);
  }

  console.log();
  console.log(`${C_BOLD}📋 Audit complet — ${company.name}${C_RESET}`);
  console.log(C_DIM + `   Généré le ${new Date().toLocaleString("fr-FR")}` + C_RESET);

  // ─── SECTION A ────────────────────────────────────────────────────────────
  section("A", "Comptages");

  const [
    devisBrouillon, devisEnvoye, devisAccepte, devisRefuse, devisExpire,
    factBrouillon, factEmise, factPayeePartiel, factPayee, factEnRetard, factAnnulee,
    nbClients, nbComediens, nbSections, nbLignes,
  ] = await Promise.all([
    prisma.devis.count({ where: { companyId: company.id, statut: "BROUILLON" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "ENVOYE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "ACCEPTE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "REFUSE" } }),
    prisma.devis.count({ where: { companyId: company.id, statut: "EXPIRE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "BROUILLON" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "EMISE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "PAYEE_PARTIEL" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "PAYEE" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "EN_RETARD" } }),
    prisma.facture.count({ where: { companyId: company.id, statut: "ANNULEE" } }),
    prisma.client.count({ where: { companyId: company.id } }),
    prisma.comedien.count({ where: { companyId: company.id } }),
    prisma.devisSection.count({ where: { devis: { companyId: company.id } } }),
    prisma.devisLigne.count({ where: { section: { devis: { companyId: company.id } } } }),
  ]);

  const totalDevis = devisBrouillon + devisEnvoye + devisAccepte + devisRefuse + devisExpire;
  const totalFactures = factBrouillon + factEmise + factPayeePartiel + factPayee + factEnRetard + factAnnulee;

  sub("Devis");
  kv("Total", totalDevis);
  kv("  BROUILLON", devisBrouillon);
  kv("  ENVOYE", devisEnvoye);
  kv("  ACCEPTE", devisAccepte);
  kv("  REFUSE", devisRefuse);
  if (devisExpire) kv("  EXPIRE", devisExpire);

  sub("Factures");
  kv("Total", totalFactures);
  kv("  BROUILLON", factBrouillon);
  kv("  EMISE", factEmise);
  if (factPayeePartiel) kv("  PAYEE_PARTIEL", factPayeePartiel);
  kv("  PAYEE", factPayee);
  if (factEnRetard) kv("  EN_RETARD", factEnRetard);
  if (factAnnulee) kv("  ANNULEE", factAnnulee);

  sub("Entités liées");
  kv("Clients", nbClients);
  kv("Comédiens", nbComediens);
  kv("Sections de devis", nbSections);
  kv("Lignes de devis", nbLignes);

  // ─── SECTION B ────────────────────────────────────────────────────────────
  section("B", "Cohérence montants");

  const [sumDevis, sumFactPayee, sumFactEmise, top10] = await Promise.all([
    prisma.devis.aggregate({
      where: { companyId: company.id },
      _sum: { totalTtc: true },
    }),
    prisma.facture.aggregate({
      where: { companyId: company.id, statut: "PAYEE" },
      _sum: { totalTtc: true },
    }),
    prisma.facture.aggregate({
      where: { companyId: company.id, statut: "EMISE" },
      _sum: { totalTtc: true },
    }),
    prisma.devis.findMany({
      where: { companyId: company.id },
      orderBy: { totalTtc: "desc" },
      take: 10,
      select: {
        numero: true,
        totalTtc: true,
        client: { select: { name: true } },
        statut: true,
      },
    }),
  ]);

  sub("Totaux");
  kvEuro("Σ TTC tous devis", sumDevis._sum.totalTtc ?? 0);
  kvEuro("Σ TTC factures PAYEE", sumFactPayee._sum.totalTtc ?? 0);
  kvEuro("Σ TTC factures EMISE (encours)", sumFactEmise._sum.totalTtc ?? 0);

  sub("Top 10 devis par TTC");
  console.log(`  ${"N°".padEnd(12)}${"Client".padEnd(32)}${"Statut".padEnd(12)}${"TTC".padStart(16)}`);
  console.log("  " + C_GRAY + bar() + C_RESET);
  for (const d of top10) {
    const num = (d.numero ?? "—").padEnd(12).slice(0, 12);
    const client = d.client.name.padEnd(32).slice(0, 32);
    const statut = d.statut.padEnd(12);
    const ttc = fmtEuros(d.totalTtc).padStart(16);
    console.log(`  ${num}${client}${statut}${ttc}`);
  }

  // ─── SECTION C ────────────────────────────────────────────────────────────
  section("C", "Anomalies à investiguer");

  // Devis : on charge tout pour pouvoir trier en plusieurs catégories
  const devisAvecSections = await prisma.devis.findMany({
    where: { companyId: company.id },
    select: {
      id: true, numero: true, statut: true, totalHt: true,
      client: { select: { name: true } },
      sousTotal: true,
      sections: {
        select: { lignes: { select: { total: true } } },
      },
    },
  });

  // ── Devis incomplets à investiguer ─────────────────────────────────
  // Règle : on flagge uniquement les devis ACTIFS (BROUILLON, ACCEPTE,
  // ENVOYE) sans aucune section. Les devis REFUSE+0 ou EXPIRE+0 sont des
  // brouillons abandonnés légitimes → reclassés en note informationnelle.
  const STATUTS_ACTIFS = new Set(["BROUILLON", "ACCEPTE", "ENVOYE"]);
  const devisSansSection = devisAvecSections.filter((d) => d.sections.length === 0);
  const devisIncomplets = devisSansSection.filter(
    (d) => STATUTS_ACTIFS.has(d.statut) && d.totalHt > 0
  );
  const devisAnnulesVides = devisSansSection.filter((d) => !devisIncomplets.includes(d));

  const devisSansLigne = devisAvecSections.filter(
    (d) => d.sections.length > 0 && d.sections.every((s) => s.lignes.length === 0)
  );

  const TOL = 0.05;
  const devisIncoherents = devisAvecSections
    .map((d) => {
      const sommeLignes = d.sections.reduce(
        (acc, s) => acc + s.lignes.reduce((a, l) => a + l.total, 0),
        0
      );
      return { d, sommeLignes, ecart: d.sousTotal - sommeLignes };
    })
    .filter((x) => x.d.sections.length > 0 && Math.abs(x.ecart) > TOL);

  sub("Devis sans aucune ligne (sections vides)");
  if (devisSansLigne.length === 0) {
    console.log("  ✓ Aucun");
  } else {
    for (const d of devisSansLigne.slice(0, 20)) {
      console.log(`  ${C_YELLOW}⚠${C_RESET}  ${d.numero ?? "—"}  ${d.client.name}`);
    }
    if (devisSansLigne.length > 20) console.log(`  ${C_DIM}…et ${devisSansLigne.length - 20} autres${C_RESET}`);
    console.log(`  → ${C_BOLD}${devisSansLigne.length}${C_RESET} devis concerné(s)`);
  }

  sub("Devis incomplets à investiguer (actif sans section, HT > 0)");
  if (devisIncomplets.length === 0) {
    console.log("  ✓ Aucun");
  } else {
    for (const d of devisIncomplets.slice(0, 20)) {
      console.log(`  ${C_YELLOW}⚠${C_RESET}  ${d.numero ?? "—"}  ${d.client.name}  [${d.statut}]  ${fmtEuros(d.totalHt)}`);
    }
    if (devisIncomplets.length > 20) console.log(`  ${C_DIM}…et ${devisIncomplets.length - 20} autres${C_RESET}`);
    console.log(`  → ${C_BOLD}${devisIncomplets.length}${C_RESET} devis concerné(s)`);
  }

  sub(`Devis avec sousTotal ≠ Σ lignes (tolérance ${TOL} €)`);
  if (devisIncoherents.length === 0) {
    console.log("  ✓ Aucun");
  } else {
    console.log(`  ${"N°".padEnd(12)}${"Client".padEnd(28)}${"sousTotal".padStart(14)}${"Σ lignes".padStart(14)}${"Écart".padStart(12)}`);
    console.log("  " + C_GRAY + bar() + C_RESET);
    for (const x of devisIncoherents.slice(0, 20)) {
      const num = (x.d.numero ?? "—").padEnd(12).slice(0, 12);
      const cl = x.d.client.name.padEnd(28).slice(0, 28);
      console.log(
        `  ${num}${cl}${fmtEuros(x.d.sousTotal).padStart(14)}${fmtEuros(x.sommeLignes).padStart(14)}${fmtEuros(x.ecart).padStart(12)}`
      );
    }
    if (devisIncoherents.length > 20) console.log(`  ${C_DIM}…et ${devisIncoherents.length - 20} autres${C_RESET}`);
    console.log(`  → ${C_BOLD}${devisIncoherents.length}${C_RESET} devis concerné(s)`);
  }

  // ── Factures sans devis lié : split charges récurrentes vs à investiguer ──
  // Heuristique de récurrence :
  //   1. Nom du client matche une liste de mots-clés (SACEM, Loyer, …)
  //   2. OU le client a ≥ 2 factures sans devis lié (cadence = récurrent)
  const factSansDevis = await prisma.facture.findMany({
    where: { companyId: company.id, devisId: null },
    select: {
      numero: true, totalTtc: true, statut: true, dateEmission: true,
      client: { select: { name: true } },
    },
    orderBy: { numero: "asc" },
  });
  const KEYWORDS_RECURRENT = /SACEM|Loyer|Indexation|Droits\s*Radio|Cotisation|Abonnement|Co.production/i;
  const countByClient = new Map<string, number>();
  for (const f of factSansDevis) countByClient.set(f.client.name, (countByClient.get(f.client.name) ?? 0) + 1);
  const isRecurrent = (clientName: string) =>
    KEYWORDS_RECURRENT.test(clientName) || (countByClient.get(clientName) ?? 0) >= 2;
  const factRecurrentes = factSansDevis.filter((f) => isRecurrent(f.client.name));
  const factInvestiguer = factSansDevis.filter((f) => !isRecurrent(f.client.name));

  sub("Factures sans devis à investiguer (hors récurrentes)");
  if (factInvestiguer.length === 0) {
    console.log("  ✓ Aucune");
  } else {
    console.log(`  ${"N°".padEnd(12)}${"Client".padEnd(32)}${"Statut".padEnd(12)}${"TTC".padStart(14)}`);
    console.log("  " + C_GRAY + bar() + C_RESET);
    for (const f of factInvestiguer) {
      const num = (f.numero ?? "—").padEnd(12).slice(0, 12);
      const cl = f.client.name.padEnd(32).slice(0, 32);
      console.log(`  ${num}${cl}${f.statut.padEnd(12)}${fmtEuros(f.totalTtc).padStart(14)}`);
    }
    console.log(`  → ${C_BOLD}${factInvestiguer.length}${C_RESET} facture(s) concernée(s)`);
  }

  // Comédiens suspects (vrai bug potentiel — noms aberrants)
  const comediensAll = await prisma.comedien.findMany({
    where: { companyId: company.id },
    select: {
      id: true, prenom: true, nom: true,
      _count: { select: { lignes: true } },
    },
  });
  const SUSPECT_RE = /^[\d\s\-_.,;:!?@#$%&*()/\\]*$/;
  const comediensSuspects = comediensAll.filter((c) => {
    const full = `${c.prenom} ${c.nom}`.trim();
    if (full.length < 3) return true;
    if (SUSPECT_RE.test(full)) return true;
    return false;
  });

  sub("Comédiens suspects (nom < 3 car. ou chiffres/symboles seuls)");
  if (comediensSuspects.length === 0) {
    console.log("  ✓ Aucun");
  } else {
    for (const c of comediensSuspects) {
      console.log(`  ${C_RED}✗${C_RESET}  "${c.prenom} ${c.nom}".trim()`);
    }
    console.log(`  → ${C_BOLD}${comediensSuspects.length}${C_RESET} comédien(s) concerné(s)`);
  }

  // ─── SECTION C-bis ─ Notes informationnelles ──────────────────────────────
  // Reclassement des "anomalies" qui sont en réalité des cas légitimes :
  // données présentes en BD mais sans impact bloquant.
  section("C-bis", "Notes informationnelles");

  // Devis annulés / expirés vides (REFUSE+0 ou EXPIRE+0)
  sub("Devis annulés vides (REFUSE/EXPIRE sans section, HT = 0)");
  if (devisAnnulesVides.length === 0) {
    console.log("  · Aucun");
  } else {
    for (const d of devisAnnulesVides.slice(0, 10)) {
      console.log(`  · ${d.numero ?? "—"}  ${d.client.name}  [${d.statut}]`);
    }
    if (devisAnnulesVides.length > 10) console.log(`  ${C_DIM}…et ${devisAnnulesVides.length - 10} autres${C_RESET}`);
    console.log(`  ${C_DIM}${devisAnnulesVides.length} devis (brouillons abandonnés, non bloquants)${C_RESET}`);
  }

  // Factures sans devis — charges récurrentes
  sub("Factures sans devis — charges récurrentes");
  if (factRecurrentes.length === 0) {
    console.log("  · Aucune");
  } else {
    console.log(`  ${"N°".padEnd(12)}${"Client".padEnd(32)}${"Statut".padEnd(12)}${"TTC".padStart(14)}`);
    console.log("  " + C_GRAY + bar() + C_RESET);
    for (const f of factRecurrentes) {
      const num = (f.numero ?? "—").padEnd(12).slice(0, 12);
      const cl = f.client.name.padEnd(32).slice(0, 32);
      console.log(`  ${num}${cl}${f.statut.padEnd(12)}${fmtEuros(f.totalTtc).padStart(14)}`);
    }
    console.log(`  ${C_DIM}${factRecurrentes.length} facture(s) (SACEM, NONNA récurrent, etc.)${C_RESET}`);
  }

  // Comédiens sans ligne active (réutilisables)
  const comediensOrphelins = comediensAll.filter((c) => c._count.lignes === 0);
  sub("Comédiens sans ligne active (réutilisables)");
  if (comediensOrphelins.length === 0) {
    console.log("  · Aucun");
  } else {
    for (const c of comediensOrphelins.slice(0, 20)) {
      console.log(`  · ${c.prenom} ${c.nom}`.trim());
    }
    if (comediensOrphelins.length > 20) console.log(`  ${C_DIM}…et ${comediensOrphelins.length - 20} autres${C_RESET}`);
    console.log(`  ${C_DIM}${comediensOrphelins.length} comédien(s) (peuvent être réutilisés)${C_RESET}`);
  }

  // Clients sans devis MAIS avec factures (cas charges récurrentes)
  const clientsAll = await prisma.client.findMany({
    where: { companyId: company.id },
    select: {
      id: true, name: true,
      _count: { select: { devis: true, factures: true } },
    },
  });
  const clientsSansDevisVraiment = clientsAll.filter(
    (c) => c._count.devis === 0 && c._count.factures === 0
  );
  const clientsSansDevisAvecFact = clientsAll.filter(
    (c) => c._count.devis === 0 && c._count.factures > 0
  );

  sub("Clients sans devis ni facture (à nettoyer ?)");
  if (clientsSansDevisVraiment.length === 0) {
    console.log("  · Aucun");
  } else {
    for (const c of clientsSansDevisVraiment.slice(0, 20)) {
      console.log(`  · ${c.name}`);
    }
    console.log(`  ${C_DIM}${clientsSansDevisVraiment.length} client(s) (zéro activité)${C_RESET}`);
  }

  sub("Clients sans devis MAIS avec factures (charges récurrentes)");
  if (clientsSansDevisAvecFact.length === 0) {
    console.log("  · Aucun");
  } else {
    for (const c of clientsSansDevisAvecFact) {
      console.log(`  · ${c.name}  (${c._count.factures} fact.)`);
    }
    console.log(`  ${C_DIM}${clientsSansDevisAvecFact.length} client(s) (légitime — pas d'orphelin réel)${C_RESET}`);
  }

  // ─── SECTION D ────────────────────────────────────────────────────────────
  section("D", "Distribution temporelle");

  const devisAvecDate = await prisma.devis.findMany({
    where: { companyId: company.id, dateEmission: { not: null } },
    select: { dateEmission: true },
  });
  const factPayeeAvecDate = await prisma.facture.findMany({
    where: {
      companyId: company.id,
      statut: "PAYEE",
      dateReglement: { not: null },
    },
    select: { dateReglement: true, totalTtc: true },
  });

  const devisParMois = new Map<string, number>();
  for (const d of devisAvecDate) {
    if (!d.dateEmission) continue;
    const dt = new Date(d.dateEmission);
    const k = `${dt.getFullYear()}-${String(dt.getMonth()).padStart(2, "0")}`;
    devisParMois.set(k, (devisParMois.get(k) ?? 0) + 1);
  }

  sub("Devis créés par mois (dateEmission)");
  if (devisParMois.size === 0) {
    console.log("  ✓ Aucun devis avec dateEmission");
  } else {
    const keys = Array.from(devisParMois.keys()).sort();
    console.log(`  ${"Mois".padEnd(14)}${"Nombre".padStart(10)}`);
    console.log("  " + C_GRAY + bar() + C_RESET);
    for (const k of keys) {
      const [y, m] = k.split("-").map(Number);
      const label = `${MOIS_FR[m]} ${y}`;
      console.log(`  ${label.padEnd(14)}${String(devisParMois.get(k)).padStart(10)}`);
    }
  }

  // Factures payées par mois (dashboard window = 6 derniers mois)
  const now = new Date();
  const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const fenetre = new Map<string, { ca: number; nb: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    fenetre.set(`${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`, { ca: 0, nb: 0 });
  }
  for (const f of factPayeeAvecDate) {
    if (!f.dateReglement) continue;
    const d = new Date(f.dateReglement);
    if (d < startOf6Months) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const cur = fenetre.get(k);
    if (cur) { cur.ca += f.totalTtc; cur.nb += 1; }
  }

  sub("Factures payées par mois (fenêtre dashboard 6 mois)");
  console.log(`  ${"Mois".padEnd(14)}${"Nb".padStart(6)}${"CA encaissé".padStart(20)}`);
  console.log("  " + C_GRAY + bar() + C_RESET);
  let totalFenetre = 0;
  let totalNb = 0;
  for (const [k, v] of fenetre.entries()) {
    const [y, m] = k.split("-").map(Number);
    const label = `${MOIS_FR[m]} ${y}`;
    console.log(`  ${label.padEnd(14)}${String(v.nb).padStart(6)}${fmtEuros(v.ca).padStart(20)}`);
    totalFenetre += v.ca;
    totalNb += v.nb;
  }
  console.log("  " + C_GRAY + bar() + C_RESET);
  console.log(`  ${C_BOLD}${"Total fenêtre".padEnd(14)}${String(totalNb).padStart(6)}${fmtEuros(totalFenetre).padStart(20)}${C_RESET}`);

  // Hors fenêtre
  const horsFenetre = factPayeeAvecDate.filter(
    (f) => f.dateReglement && new Date(f.dateReglement) < startOf6Months
  );
  if (horsFenetre.length > 0) {
    const sumHors = horsFenetre.reduce((s, f) => s + f.totalTtc, 0);
    console.log(`  ${C_DIM}+ ${horsFenetre.length} facture(s) payée(s) hors fenêtre : ${fmtEuros(sumHors)}${C_RESET}`);
  }

  console.log();
  console.log(C_CYAN + bar(76) + C_RESET);
  console.log(`${C_DIM}Audit terminé.${C_RESET}`);
  console.log();

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
