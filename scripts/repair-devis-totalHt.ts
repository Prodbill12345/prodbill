/**
 * scripts/repair-devis-totalHt.ts
 *
 * Repare les devis dont le totalHt stocke = totalApresRemise (NET au lieu
 * de BRUT). Strictement limite au sous-pattern A :
 *
 *   - delta = totalHt_stocke - (sousTotal + csCom + csTech + FG + marge)
 *   - |delta| > EPSILON_DELTA            → ecart significatif
 *   - |totalHt - totalApresRemise| <= EPSILON_PATTERN  → bug d'import
 *   - |remise - |delta|| <= EPSILON_REMISE → la remise explique exactement l'ecart
 *
 * Sont exclus :
 *   - Les devis avec remise = 0 mais delta significatif (sous-pattern B)
 *   - Les devis avec delta > 0 (suspect_delta_positif)
 *   - Les devis avec |delta| < EPSILON_DELTA (rounding flottant legitime)
 *
 * Operations :
 *   1. UPDATE Devis SET totalHt = sousTotal + csCom + csTech + FG + marge
 *      (les autres champs derivables — totalApresRemise, tva, totalTtc,
 *       remise — sont laisses tels quels, ils sont deja corrects)
 *   2. UPDATE Facture (associees, snapshots ayant le meme bug) idem
 *   3. AuditLog FACTURE_TOTAUX_RECTIFIE_ADMIN par facture rectifiee
 *
 * Tout est dans une seule transaction Prisma. Sanity check final :
 * re-fetch des devis modifies, doit avoir 0 cas pattern A residuel.
 *
 * Modes :
 *   --dry-run (defaut) : aucune ecriture, sortie detaillee
 *   --commit           : execute la transaction
 *   --admin-email <e>  : email Clerk d'un admin (pour resolution userId
 *                        AuditLog). A defaut : premier ADMIN de chaque
 *                        company impactee.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Tolerances independantes pour distinguer les niveaux de detection
const EPSILON_DELTA = 1.0;   // |delta| > 1 € pour exclure rounding
const EPSILON_PATTERN = 0.02; // |totalHt - totalApresRemise|
const EPSILON_REMISE = 0.01;  // |remise - |delta||

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

interface RepairCase {
  id: string;
  numero: string | null;
  companyId: string;
  companyName: string;
  clientName: string;
  statut: string;
  sousTotal: number;
  csComedien: number;
  csTechniciens: number;
  fraisGeneraux: number;
  marge: number;
  coproduction: number;
  storedTotalHt: number;
  expectedTotalHt: number;
  remise: number;
  totalApresRemise: number;
  factures: {
    id: string;
    numero: string;
    statut: string;
    storedTotalHt: number;
    newTotalHt: number;
    sousTotal: number;
    csComedien: number;
    csTechniciens: number;
    fraisGeneraux: number;
    marge: number;
    coproduction: number;
    remise: number;
  }[];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { commit: boolean; adminEmail: string | null } = {
    commit: false,
    adminEmail: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--commit") out.commit = true;
    else if (a === "--admin-email") out.adminEmail = args[++i];
  }
  return out;
}

async function detectPatternACases(): Promise<RepairCase[]> {
  const allDevis = await prisma.devis.findMany({
    include: {
      company: { select: { id: true, name: true } },
      client: { select: { name: true } },
      factures: true,
    },
    orderBy: [{ companyId: "asc" }, { numero: "asc" }],
  });

  const cases: RepairCase[] = [];

  for (const d of allDevis) {
    const expected = r2(
      d.sousTotal + d.csComedien + d.csTechniciens + d.fraisGeneraux + d.marge
    );
    const delta = r2(d.totalHt - expected);

    if (Math.abs(delta) <= EPSILON_DELTA) continue; // rounding
    if (delta > 0) continue; // suspect positif
    if (r2(Math.abs(d.totalHt - d.totalApresRemise)) > EPSILON_PATTERN) continue; // pas le bug d'import
    if (r2(Math.abs(d.remise - Math.abs(delta))) > EPSILON_REMISE) continue; // remise ne colle pas

    // Pattern A confirme — on prepare la repair
    const newTotalHtBrut = r2(
      d.sousTotal +
        d.csComedien +
        d.csTechniciens +
        d.fraisGeneraux +
        d.marge -
        d.coproduction
    );

    cases.push({
      id: d.id,
      numero: d.numero,
      companyId: d.companyId,
      companyName: d.company.name,
      clientName: d.client.name,
      statut: d.statut,
      sousTotal: d.sousTotal,
      csComedien: d.csComedien,
      csTechniciens: d.csTechniciens,
      fraisGeneraux: d.fraisGeneraux,
      marge: d.marge,
      coproduction: d.coproduction,
      storedTotalHt: d.totalHt,
      expectedTotalHt: newTotalHtBrut,
      remise: d.remise,
      totalApresRemise: d.totalApresRemise,
      factures: d.factures.map((f) => ({
        id: f.id,
        numero: f.numero,
        statut: f.statut,
        storedTotalHt: f.totalHt,
        newTotalHt: r2(
          f.sousTotal +
            f.csComedien +
            f.csTechniciens +
            f.fraisGeneraux +
            f.marge -
            f.coproduction
        ),
        sousTotal: f.sousTotal,
        csComedien: f.csComedien,
        csTechniciens: f.csTechniciens,
        fraisGeneraux: f.fraisGeneraux,
        marge: f.marge,
        coproduction: f.coproduction,
        remise: f.remise,
      })),
    });
  }

  return cases;
}

async function resolveAdminUserId(
  companyId: string,
  adminEmail: string | null
): Promise<{ userId: string; userName: string }> {
  if (adminEmail) {
    const u = await prisma.user.findFirst({
      where: { companyId, email: adminEmail },
    });
    if (u) return { userId: u.id, userName: `[ADMIN ${u.email}] script-repair` };
  }
  // Fallback : premier ADMIN de la company
  const admin = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) {
    return {
      userId: admin.id,
      userName: `[ADMIN ${admin.email}] script-repair-devis-totalHt`,
    };
  }
  // Dernier recours : premier user de la company
  const anyUser = await prisma.user.findFirst({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });
  if (!anyUser) {
    throw new Error(
      `Impossible de trouver un user pour attribuer l'AuditLog dans company ${companyId}`
    );
  }
  return {
    userId: anyUser.id,
    userName: `[script-repair-devis-totalHt] (no ADMIN found)`,
  };
}

function printDryRun(cases: RepairCase[]) {
  console.log("\n═══════════════════════════════════════════════");
  console.log("DRY-RUN — REPAIR DEVIS totalHt");
  console.log("═══════════════════════════════════════════════\n");
  console.log(`Devis pattern A detectes : ${cases.length}`);
  const allFactures = cases.flatMap((c) => c.factures);
  const facturesEmise = allFactures.filter((f) => f.statut === "EMISE");
  const facturesPayee = allFactures.filter((f) => f.statut === "PAYEE");
  const facturesAutres = allFactures.filter(
    (f) => !["EMISE", "PAYEE"].includes(f.statut)
  );
  console.log(
    `Factures associees       : ${allFactures.length} (${facturesEmise.length} EMISE, ${facturesPayee.length} PAYEE${facturesAutres.length ? `, ${facturesAutres.length} autres` : ""})`
  );
  console.log();

  for (const c of cases) {
    console.log(
      `─── ${c.numero ?? `(brouillon-${c.id.slice(0, 8)})`}  ${c.companyName}  ${c.statut}  → client ${c.clientName} ───`
    );
    console.log(
      `  Devis ${c.id} :  totalHt ${c.storedTotalHt.toFixed(2)} → ${c.expectedTotalHt.toFixed(2)} €  (delta +${(c.expectedTotalHt - c.storedTotalHt).toFixed(2)})`
    );
    console.log(
      `    composantes : ${c.sousTotal.toFixed(2)} + ${c.csComedien.toFixed(2)} + ${c.csTechniciens.toFixed(2)} + ${c.fraisGeneraux.toFixed(2)} + ${c.marge.toFixed(2)} - coprod ${c.coproduction.toFixed(2)}`
    );
    console.log(
      `    remise=${c.remise.toFixed(2)} (inchangee)  apresRemise=${c.totalApresRemise.toFixed(2)} (inchange)`
    );
    for (const f of c.factures) {
      console.log(
        `  Facture ${f.numero}  ${f.statut} :  totalHt ${f.storedTotalHt.toFixed(2)} → ${f.newTotalHt.toFixed(2)} €  (remise=${f.remise.toFixed(2)})`
      );
    }
    console.log();
  }

  // Recap par statut
  const statutDevis = new Map<string, number>();
  for (const c of cases) statutDevis.set(c.statut, (statutDevis.get(c.statut) ?? 0) + 1);
  console.log("Repartition statuts devis :");
  for (const [s, n] of statutDevis) console.log(`  ${s.padEnd(12)} ${n}`);

  if (facturesPayee.length > 0) {
    console.log("\n⚠  Factures PAYEE concernees (a remonter en priorite) :");
    for (const c of cases) {
      for (const f of c.factures) {
        if (f.statut === "PAYEE") {
          console.log(
            `  - ${f.numero} (devis ${c.numero}, client ${c.clientName}, ${c.companyName})`
          );
        }
      }
    }
  }
}

async function commitTransaction(
  cases: RepairCase[],
  adminEmail: string | null
): Promise<void> {
  console.log("\n═══════════════════════════════════════════════");
  console.log("COMMIT — REPAIR DEVIS totalHt");
  console.log("═══════════════════════════════════════════════\n");

  // Pre-resolve les userIds AuditLog par company
  const companyIds = [...new Set(cases.map((c) => c.companyId))];
  const userIdByCompany = new Map<
    string,
    { userId: string; userName: string }
  >();
  for (const cid of companyIds) {
    userIdByCompany.set(cid, await resolveAdminUserId(cid, adminEmail));
  }

  let nbDevisUpdated = 0;
  let nbFacturesUpdated = 0;
  let nbFacturesPayeeUpdated = 0;
  let nbAuditLogs = 0;
  const payeeFactures: { numero: string; devisNumero: string | null; client: string; company: string }[] = [];

  await prisma.$transaction(
    async (tx) => {
      for (const c of cases) {
        // 1. Update Devis
        await tx.devis.update({
          where: { id: c.id },
          data: { totalHt: c.expectedTotalHt },
        });
        nbDevisUpdated++;

        // 2. Update Factures + AuditLog
        const actor = userIdByCompany.get(c.companyId)!;
        for (const f of c.factures) {
          await tx.facture.update({
            where: { id: f.id },
            data: { totalHt: f.newTotalHt },
          });
          nbFacturesUpdated++;
          if (f.statut === "PAYEE") {
            nbFacturesPayeeUpdated++;
            payeeFactures.push({
              numero: f.numero,
              devisNumero: c.numero,
              client: c.clientName,
              company: c.companyName,
            });
          }

          await tx.auditLog.create({
            data: {
              companyId: c.companyId,
              userId: actor.userId,
              userName: actor.userName,
              action: "FACTURE_TOTAUX_RECTIFIE_ADMIN",
              entityType: "Facture",
              entityId: f.id,
              factureId: f.id,
              details: {
                reason: "Rectification post-import historique — totalHt brut",
                before: f.storedTotalHt,
                after: f.newTotalHt,
                impactClient: false,
                pdfClientInchange: true,
                devisId: c.id,
                devisNumero: c.numero,
              },
            },
          });
          nbAuditLogs++;
        }
      }

      // Sanity check final intra-transaction : aucune ligne pattern A ne doit
      // rester sur les devis qu'on vient de toucher.
      const touchedIds = cases.map((c) => c.id);
      const reverif = await tx.devis.findMany({
        where: { id: { in: touchedIds } },
      });
      let residualPatternA = 0;
      for (const d of reverif) {
        const expected = r2(
          d.sousTotal + d.csComedien + d.csTechniciens + d.fraisGeneraux + d.marge
        );
        const delta = r2(d.totalHt - expected);
        const matchesPatternA =
          Math.abs(delta) > EPSILON_DELTA &&
          delta < 0 &&
          r2(Math.abs(d.totalHt - d.totalApresRemise)) <= EPSILON_PATTERN &&
          r2(Math.abs(d.remise - Math.abs(delta))) <= EPSILON_REMISE;
        if (matchesPatternA) residualPatternA++;
      }
      if (residualPatternA > 0) {
        throw new Error(
          `Sanity check echoue : ${residualPatternA} devis pattern A residuels apres repair. ROLLBACK.`
        );
      }
    },
    { timeout: 60_000 }
  );

  console.log(`\n✓ Transaction validee.`);
  console.log(`  Devis modifies              : ${nbDevisUpdated}`);
  console.log(
    `  Factures modifiees          : ${nbFacturesUpdated} (dont ${nbFacturesPayeeUpdated} PAYEE)`
  );
  console.log(`  AuditLogs crees             : ${nbAuditLogs}`);
  console.log(`  Sanity check final          : OK (0 pattern A residuel)`);

  if (payeeFactures.length > 0) {
    console.log(`\n⚠  Factures PAYEE rectifiees (a remonter prioritairement) :`);
    for (const f of payeeFactures) {
      console.log(
        `  - ${f.numero}  (devis ${f.devisNumero}, ${f.client}, ${f.company})`
      );
    }
  }
}

async function main() {
  const args = parseArgs();

  const cases = await detectPatternACases();

  // Sanity check pre-execution : pour chaque cas, verifier que l'invariant
  // totalHtBrut = totalHt_stocke + remise tient a 0.01 € pres. Si non, abort.
  for (const c of cases) {
    const reconstructedBrut = r2(c.storedTotalHt + c.remise);
    // Arrondi du diff pour absorber les artefacts floats (0.010000000005…)
    const diff = r2(Math.abs(reconstructedBrut - c.expectedTotalHt));
    if (diff > EPSILON_REMISE) {
      console.error(
        `✗ Sanity check pre-execution echoue sur ${c.numero ?? c.id} :`
      );
      console.error(
        `  expectedTotalHt (${c.expectedTotalHt}) != storedTotalHt + remise (${reconstructedBrut}), diff=${diff}`
      );
      process.exit(1);
    }
  }
  console.log(
    `Sanity check pre-execution : OK (${cases.length} devis, invariant remise == |delta| verifie)`
  );

  if (cases.length === 0) {
    console.log("\n✓ Rien a reparer. Tous les devis sont coherents.");
    return;
  }

  if (!args.commit) {
    printDryRun(cases);
    console.log("\n────────────────────────────────────────────────");
    console.log(
      "MODE DRY-RUN. Pour executer reellement : ajouter --commit"
    );
    return;
  }

  await commitTransaction(cases, args.adminEmail);
}

main()
  .catch((err) => {
    console.error("\nErreur fatale :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
