/**
 * Tests d'isolation Phase 1 multi-tenant.
 *
 * Crée temporairement un Workspace 2 + une Company, un Client, un Devis,
 * une Section, une Ligne, et tente 5 attaques cross-tenant depuis le
 * contexte Caleson. Les 5 doivent échouer / retourner null.
 *
 * Cleanup en fin de run : supprime tout ce qui a été créé pour Workspace 2.
 */

// Load env BEFORE importing modules qui instancient PrismaClient au top-level.
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/roselaine.touati/Desktop/prodbill/.env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scopedPrisma, CrossTenantError } = require("../src/lib/scoped-prisma") as typeof import("../src/lib/scoped-prisma");

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const C_GREEN = "\x1b[32m";
const C_RED = "\x1b[31m";
const C_DIM = "\x1b[2m";
const C_BOLD = "\x1b[1m";
const C_RESET = "\x1b[0m";

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const icon = ok ? `${C_GREEN}✓${C_RESET}` : `${C_RED}✗${C_RESET}`;
  console.log(`  ${icon} ${name}\n     ${C_DIM}${detail}${C_RESET}`);
}

async function main() {
  // ── Setup : workspace 1 (Caleson) + workspace 2 (test) ─────────────
  const caleson = await prisma.company.findFirst({
    where: { name: { contains: "Caleson", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!caleson) throw new Error("Caleson introuvable");

  console.log(`\n${C_BOLD}Setup${C_RESET}`);
  console.log(`  Workspace 1 = ${caleson.name} (${caleson.id})`);

  // Cleanup éventuel d'un précédent test
  const existingW2 = await prisma.company.findUnique({
    where: { clerkOrgId: "test-isolation-w2" },
  });
  if (existingW2) {
    await prisma.devisLigne.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.devisSection.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.facture.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.devis.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.client.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.user.deleteMany({ where: { companyId: existingW2.id } });
    await prisma.company.delete({ where: { id: existingW2.id } });
  }

  const w2 = await prisma.company.create({
    data: {
      name: "Workspace 2 — Test Isolation",
      siret: `TEST_${Date.now()}`,
      tvaIntra: "FR99TEST",
      address: "1 rue du Test",
      iban: "FR00 0000 0000 0000",
      bic: "TESTFRPP",
      clerkOrgId: "test-isolation-w2",
    },
  });
  const w2User = await prisma.user.create({
    data: {
      clerkId: `test-user-${Date.now()}`,
      email: "test@isolation.dev",
      name: "Test User",
      role: "ADMIN",
      companyId: w2.id,
    },
  });
  console.log(`  Workspace 2 = ${w2.name} (${w2.id})`);

  // Récup un user Caleson pour les createdById
  const calesonUser = await prisma.user.findFirst({
    where: { companyId: caleson.id },
    select: { id: true },
  });
  if (!calesonUser) throw new Error("Aucun user Caleson");

  // Crée 1 client + 1 devis + 1 section + 1 ligne + 1 facture dans W2
  const w2Client = await prisma.client.create({
    data: { companyId: w2.id, name: "Client W2", address: "", email: "client@w2.test" },
  });
  const w2Devis = await prisma.devis.create({
    data: {
      companyId: w2.id,
      clientId: w2Client.id,
      createdById: w2User.id,
      numero: "W2-0001",
      objet: "Devis test W2",
      tauxCsComedien: 0.57,
      tauxCsTech: 0.65,
      tauxFg: 0.05,
      tauxMarge: 0.15,
      sousTotal: 1000,
      totalHt: 1000,
      tva: 200,
      totalTtc: 1200,
      statut: "ACCEPTE",
    },
  });
  const w2Section = await prisma.devisSection.create({
    data: { companyId: w2.id, devisId: w2Devis.id, titre: "Section W2", ordre: 0 },
  });
  const w2Ligne = await prisma.devisLigne.create({
    data: {
      companyId: w2.id,
      sectionId: w2Section.id,
      libelle: "Ligne W2",
      tag: "STUDIO",
      quantite: 1,
      prixUnit: 1000,
      total: 1000,
      ordre: 0,
    },
  });
  const w2Facture = await prisma.facture.create({
    data: {
      companyId: w2.id,
      clientId: w2Client.id,
      devisId: w2Devis.id,
      createdById: w2User.id,
      numero: "W2-F0001",
      type: "SOLDE",
      totalHt: 1000,
      tva: 200,
      totalTtc: 1200,
    },
  });
  console.log(
    `  Données W2 : Client ${w2Client.id.slice(0, 8)}… / Devis ${w2Devis.id.slice(0, 8)}… / Section ${w2Section.id.slice(0, 8)}… / Ligne ${w2Ligne.id.slice(0, 8)}… / Facture ${w2Facture.id.slice(0, 8)}…`
  );

  // ── Contexte Caleson : on agit comme un user Caleson ───────────────
  const db = scopedPrisma(caleson.id);

  console.log(`\n${C_BOLD}Scénarios d'attaque (contexte = Caleson)${C_RESET}\n`);

  // ── Scénario 1 : findMany cross-workspace ──────────────────────────
  try {
    const allDevis = await db.devis.findMany({});
    const leakW2 = allDevis.some((d) => d.id === w2Devis.id);
    const allBelongCaleson = allDevis.every((d) => d.companyId === caleson.id);
    record(
      "1. findMany cross-workspace",
      !leakW2 && allBelongCaleson,
      `${allDevis.length} devis remontés, aucun de W2 (leak W2 = ${leakW2})`
    );
  } catch (e) {
    record("1. findMany cross-workspace", false, `Exception inattendue : ${(e as Error).message}`);
  }

  // ── Scénario 2 : findUnique par ID d'un autre tenant ───────────────
  try {
    const f = await db.devis.findUnique({ where: { id: w2Devis.id } });
    record(
      "2. findUnique par ID d'un autre tenant",
      f === null,
      `Résultat = ${f === null ? "null ✓" : "FUITE — devis W2 retourné !"}`
    );
  } catch (e) {
    record("2. findUnique par ID d'un autre tenant", false, `Exception inattendue : ${(e as Error).message}`);
  }

  // Bonus : findUnique par numero composite sur Facture
  try {
    // Cast nécessaire : depuis le scoping composite, Prisma type-check exige
    // companyId_numero. Le helper réécrit l'arg en runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = await (db.facture.findUnique as any)({ where: { numero: "W2-F0001" } });
    record(
      "2-bis. findUnique Facture.numero d'un autre tenant",
      f === null,
      `Résultat = ${f === null ? "null ✓ (composite key scope)" : "FUITE — facture W2 retournée !"}`
    );
  } catch (e) {
    record("2-bis. findUnique Facture.numero d'un autre tenant", false, `Exception : ${(e as Error).message}`);
  }

  // ── Scénario 3 : update d'une ressource d'un autre tenant ──────────
  try {
    await db.devis.update({
      where: { id: w2Devis.id },
      data: { objet: "PWN" },
    });
    record("3. update sur ressource d'un autre tenant", false, "FUITE — update a réussi !");
  } catch (e) {
    const msg = (e as Error).message;
    const isExpected = msg.includes("Record") || msg.includes("not found") || msg.includes("P2025");
    record(
      "3. update sur ressource d'un autre tenant",
      isExpected,
      `Exception attendue : ${msg.split("\n")[0].slice(0, 80)}`
    );
  }
  // Verifie que le devis W2 n'a PAS été modifié
  const w2After = await prisma.devis.findUnique({ where: { id: w2Devis.id } });
  if (w2After?.objet !== "Devis test W2") {
    record("3-verif. Devis W2 intouché", false, `objet = "${w2After?.objet}" (devait rester "Devis test W2")`);
  }

  // ── Scénario 4 : delete d'une ressource d'un autre tenant ──────────
  try {
    await db.devis.delete({ where: { id: w2Devis.id } });
    record("4. delete sur ressource d'un autre tenant", false, "FUITE — delete a réussi !");
  } catch (e) {
    const msg = (e as Error).message;
    const isExpected = msg.includes("Record") || msg.includes("not found") || msg.includes("P2025");
    record(
      "4. delete sur ressource d'un autre tenant",
      isExpected,
      `Exception attendue : ${msg.split("\n")[0].slice(0, 80)}`
    );
  }
  // Verifie présence de la row W2
  const w2Still = await prisma.devis.findUnique({ where: { id: w2Devis.id } });
  if (!w2Still) {
    record("4-verif. Devis W2 toujours présent", false, "Le devis W2 a été supprimé !");
  }

  // ── Scénario 5 : connect d'une ressource d'un autre tenant ─────────
  try {
    // Tente de créer une Facture (contexte Caleson) liée au Devis W2
    const calesonClient = await prisma.client.findFirst({ where: { companyId: caleson.id } });
    // Cast en any : companyId est injecté par l'extension à runtime, mais TS
    // ne le sait pas et exige sa présence explicite dans le type Unchecked.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.facture.create as any)({
      data: {
        clientId: calesonClient!.id,
        devisId: w2Devis.id, // ← FK cross-tenant
        createdById: calesonUser.id,
        numero: "PWN-0001",
        type: "SOLDE",
        totalHt: 1,
        tva: 0.2,
        totalTtc: 1.2,
      },
    });
    record("5. connect (FK) d'une ressource d'un autre tenant", false, "FUITE — création a réussi avec FK W2 !");
  } catch (e) {
    const isCrossTenant = e instanceof CrossTenantError;
    record(
      "5. connect (FK) d'une ressource d'un autre tenant",
      isCrossTenant,
      isCrossTenant
        ? `CrossTenantError levée ✓ : ${(e as Error).message.slice(0, 80)}`
        : `Exception inattendue : ${(e as Error).message.slice(0, 80)}`
    );
  }

  // ── Scénario 7 : route /api/comediens/[id]/projets cross-tenant ────
  // Reproduit ce que faisait la route AVANT le fix (filtre manuel post-query)
  // pour valider que l'injection scoped-prisma est suffisante. On crée d'abord
  // un comédien W2 lié à une ligne du devis W2.
  const w2Comedien = await prisma.comedien.create({
    data: { companyId: w2.id, prenom: "Test", nom: "Voix W2" },
  });
  await prisma.devisLigne.update({
    where: { id: w2Ligne.id },
    data: { comedienId: w2Comedien.id, tag: "ARTISTE" },
  });

  try {
    // Depuis le contexte Caleson, on demande les projets du comédien W2.
    // db.comedien.findFirst({ id: w2Comedien.id }) doit retourner null
    // (le comédien appartient à W2), donc la route répond 404 — pas de fuite.
    const comFromCaleson = await db.comedien.findFirst({
      where: { id: w2Comedien.id },
      select: { id: true },
    });
    record(
      "7. comediens/[id]/projets cross-tenant",
      comFromCaleson === null,
      `comedien W2 vu depuis Caleson = ${comFromCaleson === null ? "null ✓ (404 attendu)" : "FUITE — comédien W2 visible !"}`
    );

    // En complément : les lignes du comédien W2 ne doivent pas remonter non plus.
    const lignesFromCaleson = await db.devisLigne.findMany({
      where: { comedienId: w2Comedien.id },
    });
    record(
      "7-bis. lignes du comédien W2 depuis Caleson",
      lignesFromCaleson.length === 0,
      `${lignesFromCaleson.length} ligne(s) remontée(s) — attendu 0`
    );
  } catch (e) {
    record("7. comediens/[id]/projets cross-tenant", false, `Exception : ${(e as Error).message}`);
  }

  // ── Inversion : depuis W2, peut-on lire Caleson ? ──────────────────
  const dbW2 = scopedPrisma(w2.id);
  const seenFromW2 = await dbW2.devis.count({});
  console.log(`\n${C_DIM}Inversion : depuis Workspace 2, count Devis = ${seenFromW2} (attendu 1, le W2-0001)${C_RESET}`);
  if (seenFromW2 !== 1) {
    record("Inversion W2→Caleson", false, `count = ${seenFromW2}, attendu 1`);
  }
  // Le comédien W2 doit être visible depuis W2
  const comFromW2 = await dbW2.comedien.findFirst({ where: { id: w2Comedien.id }, select: { id: true } });
  if (!comFromW2) {
    record("Inversion comédien W2", false, "comédien W2 invisible depuis W2 — bug helper");
  }

  // ── Cleanup ────────────────────────────────────────────────────────
  await prisma.facture.deleteMany({ where: { companyId: w2.id } });
  await prisma.devisLigne.deleteMany({ where: { companyId: w2.id } });
  await prisma.devisSection.deleteMany({ where: { companyId: w2.id } });
  await prisma.devis.deleteMany({ where: { companyId: w2.id } });
  await prisma.comedien.deleteMany({ where: { companyId: w2.id } });
  await prisma.client.deleteMany({ where: { companyId: w2.id } });
  await prisma.user.deleteMany({ where: { companyId: w2.id } });
  await prisma.company.delete({ where: { id: w2.id } });
  console.log(`\n${C_DIM}Cleanup terminé.${C_RESET}`);

  // ── Récap ──────────────────────────────────────────────────────────
  console.log(`\n${C_BOLD}═══════════════════════════════════════════════════════════════════${C_RESET}`);
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`${C_BOLD}Récap : ${passed}/${total} tests passés${C_RESET}`);
  for (const r of results) {
    const icon = r.ok ? `${C_GREEN}✓${C_RESET}` : `${C_RED}✗${C_RESET}`;
    console.log(`  ${icon} ${r.name}`);
  }

  await prisma.$disconnect();
  if (passed !== total) process.exit(1);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
