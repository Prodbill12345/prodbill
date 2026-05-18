/**
 * scripts/restore-devis-taux.ts
 *
 * Restauration manuelle assistée des taux d'un devis dont les valeurs
 * d'origine ont été écrasées (typiquement par l'import historique
 * d'avril 2026 sur Caleson — voir BUG #4, docs/DATA-OPERATIONS.md à
 * compléter en post-exécution).
 *
 * MODE PAR DÉFAUT : --dry-run. Aucune écriture.
 * Mode --commit OBLIGATOIRE pour exécuter.
 *
 * USAGE
 * =====
 *
 * Cible : un devis unique
 *   npx tsx scripts/restore-devis-taux.ts \
 *     --numero 26089 \
 *     --tauxFgPct 3 --tauxMargePct 13 \
 *     [--tauxCsComedienPct 57] [--tauxCsTechPct 65] \
 *     [--reason "Caleson — taux d'origine du PDF source K-LINE"] \
 *     [--admin-email roselaine.touati@live.fr]
 *
 * Cible : batch via CSV
 *   npx tsx scripts/restore-devis-taux.ts --csv /path/to/taux.csv
 *   Format CSV (avec header) :
 *     numero,tauxFgPct,tauxMargePct,tauxCsComedienPct,tauxCsTechPct
 *     26089,3,13,,
 *     26106,4,14,57,65
 *   Colonnes vides = on garde la valeur actuelle du devis.
 *
 * Pour exécuter réellement : ajouter --commit en fin de ligne.
 *
 * COMPORTEMENT
 * ============
 *
 * Pour chaque devis ciblé :
 *   1. Charge le devis + ses sections + ses lignes (lecture seule)
 *   2. Détermine les NOUVEAUX taux (CLI args + valeurs actuelles pour les
 *      colonnes laissées vides)
 *   3. Recompute les totaux via calculerDevis() avec les nouveaux taux
 *      et les lignes existantes (la remise est preservee)
 *   4. UPDATE Devis SET tauxFg, tauxMarge, [tauxCsComedien, tauxCsTech],
 *        fraisGeneraux, marge, baseMarge, csComedien, csTechniciens,
 *        totalHt, totalApresRemise, tva, totalTtc
 *      Champs intacts : sousTotal, remise, coproduction, tauxTva, sections,
 *        lignes (la geometrie du devis ne change pas).
 *   5. Pour chaque Facture associée :
 *      - statut === "BROUILLON"      → recompute et UPDATE
 *      - statut === "EMISE"/"PAYEE"/"EN_RETARD"/"PAYEE_PARTIEL"/"ANNULEE"
 *                                    → log warning + skip (immutabilité légale)
 *   6. AuditLog par row modifiée (action=DEVIS_TAUX_RECTIFIE_ADMIN ou
 *      FACTURE_TAUX_RECTIFIE_ADMIN), details {reason, before, after,
 *      changedFields}.
 *
 * Tout est dans UNE transaction Prisma. Sanity check final : la nouvelle
 * valeur DB doit matcher celle calculée par calculerDevis() à 0,01 € près
 * sur totalHt, sinon rollback.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import { calculerDevis } from "../src/lib/calculations";
import { pctToDecimal } from "../src/lib/parse-pct";
import type { LigneInput, TauxConfig } from "../src/types";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EPSILON = 0.02;

interface Args {
  commit: boolean;
  numero: string | null;
  csv: string | null;
  tauxFgPct: number | null;
  tauxMargePct: number | null;
  tauxCsComedienPct: number | null;
  tauxCsTechPct: number | null;
  reason: string;
  adminEmail: string | null;
}

interface Target {
  numero: string;
  tauxFgPct: number | null;
  tauxMargePct: number | null;
  tauxCsComedienPct: number | null;
  tauxCsTechPct: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    commit: false,
    numero: null,
    csv: null,
    tauxFgPct: null,
    tauxMargePct: null,
    tauxCsComedienPct: null,
    tauxCsTechPct: null,
    reason: "Restauration manuelle taux d'origine (post-import historique)",
    adminEmail: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--commit": out.commit = true; break;
      case "--numero": out.numero = argv[++i]; break;
      case "--csv": out.csv = argv[++i]; break;
      case "--tauxFgPct": out.tauxFgPct = parseFloat(argv[++i]); break;
      case "--tauxMargePct": out.tauxMargePct = parseFloat(argv[++i]); break;
      case "--tauxCsComedienPct": out.tauxCsComedienPct = parseFloat(argv[++i]); break;
      case "--tauxCsTechPct": out.tauxCsTechPct = parseFloat(argv[++i]); break;
      case "--reason": out.reason = argv[++i]; break;
      case "--admin-email": out.adminEmail = argv[++i]; break;
      default:
        if (a.startsWith("--")) {
          console.error(`Argument inconnu : ${a}`);
          process.exit(1);
        }
    }
  }
  return out;
}

function loadTargets(args: Args): Target[] {
  if (args.csv) {
    if (!fs.existsSync(args.csv)) {
      console.error(`CSV introuvable : ${args.csv}`);
      process.exit(1);
    }
    const content = fs.readFileSync(args.csv, "utf-8").trim();
    const lines = content.split(/\r?\n/);
    const header = lines.shift()!.split(",").map((s) => s.trim());
    const idxNumero = header.indexOf("numero");
    const idxFg = header.indexOf("tauxFgPct");
    const idxMarge = header.indexOf("tauxMargePct");
    const idxCsCom = header.indexOf("tauxCsComedienPct");
    const idxCsTech = header.indexOf("tauxCsTechPct");
    if (idxNumero < 0 || idxFg < 0 || idxMarge < 0) {
      console.error("CSV doit contenir au moins : numero, tauxFgPct, tauxMargePct");
      process.exit(1);
    }
    return lines.filter((l) => l.trim()).map((l) => {
      const cells = l.split(",").map((s) => s.trim());
      const num = (cells[idxNumero] || "").trim();
      const parseOrNull = (s: string | undefined) => {
        if (s === undefined || s === "") return null;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
      };
      return {
        numero: num,
        tauxFgPct: parseOrNull(cells[idxFg]),
        tauxMargePct: parseOrNull(cells[idxMarge]),
        tauxCsComedienPct: idxCsCom >= 0 ? parseOrNull(cells[idxCsCom]) : null,
        tauxCsTechPct: idxCsTech >= 0 ? parseOrNull(cells[idxCsTech]) : null,
      };
    });
  }
  if (args.numero) {
    return [{
      numero: args.numero,
      tauxFgPct: args.tauxFgPct,
      tauxMargePct: args.tauxMargePct,
      tauxCsComedienPct: args.tauxCsComedienPct,
      tauxCsTechPct: args.tauxCsTechPct,
    }];
  }
  console.error("Usage : --numero <N> [--tauxFgPct X --tauxMargePct Y] OU --csv <path>");
  process.exit(1);
}

interface DevisLoaded {
  id: string;
  numero: string | null;
  companyId: string;
  companyName: string;
  clientName: string;
  statut: string;
  sousTotal: number;
  remise: number;
  coproduction: number;
  tauxCsComedien: number;
  tauxCsTech: number;
  tauxFg: number;
  tauxMarge: number;
  csComedien: number;
  csTechniciens: number;
  baseMarge: number;
  fraisGeneraux: number;
  marge: number;
  totalHt: number;
  totalApresRemise: number;
  tva: number;
  totalTtc: number;
  lignes: LigneInput[];
  factures: {
    id: string;
    numero: string;
    statut: string;
    type: string;
    totalHt: number;
    tauxFg: number;
    tauxMarge: number;
  }[];
}

async function loadDevis(target: Target): Promise<DevisLoaded | null> {
  const d = await prisma.devis.findFirst({
    where: { numero: target.numero },
    include: {
      company: { select: { name: true } },
      client: { select: { name: true } },
      sections: {
        include: { lignes: { orderBy: { ordre: "asc" } } },
        orderBy: { ordre: "asc" },
      },
      factures: {
        select: {
          id: true, numero: true, statut: true, type: true,
          totalHt: true, tauxFg: true, tauxMarge: true,
        },
      },
    },
  });
  if (!d) return null;
  const lignes: LigneInput[] = d.sections.flatMap((s) => s.lignes).map((l) => ({
    tag: l.tag as LigneInput["tag"],
    quantite: l.quantite,
    prixUnit: l.prixUnit,
    tauxIndexation: l.tauxIndexation,
  }));
  return {
    id: d.id,
    numero: d.numero,
    companyId: d.companyId,
    companyName: d.company.name,
    clientName: d.client.name,
    statut: d.statut,
    sousTotal: d.sousTotal,
    remise: d.remise,
    coproduction: d.coproduction,
    tauxCsComedien: d.tauxCsComedien,
    tauxCsTech: d.tauxCsTech,
    tauxFg: d.tauxFg,
    tauxMarge: d.tauxMarge,
    csComedien: d.csComedien,
    csTechniciens: d.csTechniciens,
    baseMarge: d.baseMarge,
    fraisGeneraux: d.fraisGeneraux,
    marge: d.marge,
    totalHt: d.totalHt,
    totalApresRemise: d.totalApresRemise,
    tva: d.tva,
    totalTtc: d.totalTtc,
    lignes,
    factures: d.factures,
  };
}

function nextTaux(devis: DevisLoaded, target: Target): TauxConfig {
  return {
    tauxCsComedien: target.tauxCsComedienPct !== null
      ? pctToDecimal(target.tauxCsComedienPct)
      : devis.tauxCsComedien,
    tauxCsTech: target.tauxCsTechPct !== null
      ? pctToDecimal(target.tauxCsTechPct)
      : devis.tauxCsTech,
    tauxFg: target.tauxFgPct !== null
      ? pctToDecimal(target.tauxFgPct)
      : devis.tauxFg,
    tauxMarge: target.tauxMargePct !== null
      ? pctToDecimal(target.tauxMargePct)
      : devis.tauxMarge,
  };
}

function changedTauxFields(before: DevisLoaded, after: TauxConfig): string[] {
  const out: string[] = [];
  if (Math.abs(before.tauxCsComedien - after.tauxCsComedien) > 1e-6) out.push("tauxCsComedien");
  if (Math.abs(before.tauxCsTech - after.tauxCsTech) > 1e-6) out.push("tauxCsTech");
  if (Math.abs(before.tauxFg - after.tauxFg) > 1e-6) out.push("tauxFg");
  if (Math.abs(before.tauxMarge - after.tauxMarge) > 1e-6) out.push("tauxMarge");
  return out;
}

async function resolveAdminUser(companyId: string, adminEmail: string | null) {
  if (adminEmail) {
    const u = await prisma.user.findFirst({ where: { companyId, email: adminEmail } });
    if (u) return { userId: u.id, userName: `[ADMIN ${u.email}] script-restore-taux` };
  }
  const admin = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin) return { userId: admin.id, userName: `[ADMIN ${admin.email}] script-restore-taux` };
  const any = await prisma.user.findFirst({ where: { companyId } });
  if (!any) throw new Error(`Aucun user trouvé pour company ${companyId}`);
  return { userId: any.id, userName: `[script-restore-taux] (no ADMIN found)` };
}

interface Plan {
  devis: DevisLoaded;
  newTaux: TauxConfig;
  recomputed: ReturnType<typeof calculerDevis>;
  changed: string[];
  facturesActionables: { id: string; numero: string; statut: string; type: string }[];
  facturesSkipped: { id: string; numero: string; statut: string; type: string }[];
}

function buildPlan(devis: DevisLoaded, target: Target): Plan {
  const newTaux = nextTaux(devis, target);
  const recomputed = calculerDevis(devis.lignes, newTaux, devis.remise);
  const changed = changedTauxFields(devis, newTaux);
  const facturesActionables: Plan["facturesActionables"] = [];
  const facturesSkipped: Plan["facturesSkipped"] = [];
  for (const f of devis.factures) {
    if (f.statut === "BROUILLON") facturesActionables.push(f);
    else facturesSkipped.push(f);
  }
  return { devis, newTaux, recomputed, changed, facturesActionables, facturesSkipped };
}

function printPlan(plan: Plan) {
  const d = plan.devis;
  console.log(`\n─── ${d.numero ?? `(brouillon ${d.id.slice(0, 8)})`}  ${d.companyName}  ${d.statut}  → client ${d.clientName} ───`);
  if (plan.changed.length === 0) {
    console.log(`  Aucun taux à changer (cibles identiques aux valeurs actuelles). Skip.`);
    return;
  }
  console.log(`  Champs taux modifiés : ${plan.changed.join(", ")}`);
  const fmtPct = (n: number) => `${(n * 100).toFixed(2).replace(/\.00$/, "")}%`;
  console.log(`  tauxFg        : ${fmtPct(d.tauxFg)} → ${fmtPct(plan.newTaux.tauxFg)}`);
  console.log(`  tauxMarge     : ${fmtPct(d.tauxMarge)} → ${fmtPct(plan.newTaux.tauxMarge)}`);
  if (plan.changed.includes("tauxCsComedien")) console.log(`  tauxCsCom     : ${fmtPct(d.tauxCsComedien)} → ${fmtPct(plan.newTaux.tauxCsComedien)}`);
  if (plan.changed.includes("tauxCsTech")) console.log(`  tauxCsTech    : ${fmtPct(d.tauxCsTech)} → ${fmtPct(plan.newTaux.tauxCsTech)}`);
  console.log(`  fraisGeneraux : ${d.fraisGeneraux.toFixed(2)} → ${plan.recomputed.fraisGeneraux.toFixed(2)} €`);
  console.log(`  marge         : ${d.marge.toFixed(2)} → ${plan.recomputed.marge.toFixed(2)} €`);
  console.log(`  totalHt       : ${d.totalHt.toFixed(2)} → ${plan.recomputed.totalHt.toFixed(2)} €`);
  console.log(`  totalTtc      : ${d.totalTtc.toFixed(2)} → ${plan.recomputed.totalTtc.toFixed(2)} €`);
  console.log(`  remise        : ${d.remise.toFixed(2)} (inchangée)`);
  console.log(`  Factures associées : ${d.factures.length}`);
  for (const f of plan.facturesActionables) {
    console.log(`    → ${f.numero}  ${f.statut} ${f.type}  : sera recomputée`);
  }
  for (const f of plan.facturesSkipped) {
    console.log(`    ⚠ ${f.numero}  ${f.statut} ${f.type}  : SKIP (statut post-émission, immutable)`);
  }
}

async function commitPlan(plan: Plan, reason: string, adminEmail: string | null) {
  const actor = await resolveAdminUser(plan.devis.companyId, adminEmail);
  const before = {
    tauxCsComedien: plan.devis.tauxCsComedien,
    tauxCsTech: plan.devis.tauxCsTech,
    tauxFg: plan.devis.tauxFg,
    tauxMarge: plan.devis.tauxMarge,
    fraisGeneraux: plan.devis.fraisGeneraux,
    marge: plan.devis.marge,
    totalHt: plan.devis.totalHt,
    totalTtc: plan.devis.totalTtc,
  };
  const after = {
    tauxCsComedien: plan.newTaux.tauxCsComedien,
    tauxCsTech: plan.newTaux.tauxCsTech,
    tauxFg: plan.newTaux.tauxFg,
    tauxMarge: plan.newTaux.tauxMarge,
    fraisGeneraux: plan.recomputed.fraisGeneraux,
    marge: plan.recomputed.marge,
    totalHt: plan.recomputed.totalHt,
    totalTtc: plan.recomputed.totalTtc,
  };

  await prisma.$transaction(async (tx) => {
    await tx.devis.update({
      where: { id: plan.devis.id },
      data: {
        tauxCsComedien: plan.newTaux.tauxCsComedien,
        tauxCsTech: plan.newTaux.tauxCsTech,
        tauxFg: plan.newTaux.tauxFg,
        tauxMarge: plan.newTaux.tauxMarge,
        csComedien: plan.recomputed.csComedien,
        csTechniciens: plan.recomputed.csTechniciens,
        baseMarge: plan.recomputed.baseMarge,
        fraisGeneraux: plan.recomputed.fraisGeneraux,
        marge: plan.recomputed.marge,
        totalHt: plan.recomputed.totalHt,
        totalApresRemise: plan.recomputed.totalApresRemise,
        tva: plan.recomputed.tva,
        totalTtc: plan.recomputed.totalTtc,
      },
    });

    await tx.auditLog.create({
      data: {
        companyId: plan.devis.companyId,
        userId: actor.userId,
        userName: actor.userName,
        action: "DEVIS_TAUX_RECTIFIE_ADMIN",
        entityType: "Devis",
        entityId: plan.devis.id,
        devisId: plan.devis.id,
        details: {
          reason,
          before,
          after,
          changedFields: plan.changed,
          facturesActionables: plan.facturesActionables.map((f) => f.numero),
          facturesSkipped: plan.facturesSkipped.map((f) => `${f.numero} (${f.statut})`),
        },
      },
    });

    // Factures BROUILLON : recompute (même formule, même lignes du devis source)
    for (const fa of plan.facturesActionables) {
      await tx.facture.update({
        where: { id: fa.id },
        data: {
          tauxCsComedien: plan.newTaux.tauxCsComedien,
          tauxCsTech: plan.newTaux.tauxCsTech,
          tauxFg: plan.newTaux.tauxFg,
          tauxMarge: plan.newTaux.tauxMarge,
          csComedien: plan.recomputed.csComedien,
          csTechniciens: plan.recomputed.csTechniciens,
          baseMarge: plan.recomputed.baseMarge,
          fraisGeneraux: plan.recomputed.fraisGeneraux,
          marge: plan.recomputed.marge,
          totalHt: plan.recomputed.totalHt,
          tva: plan.recomputed.tva,
          totalTtc: plan.recomputed.totalTtc,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: plan.devis.companyId,
          userId: actor.userId,
          userName: actor.userName,
          action: "FACTURE_TAUX_RECTIFIE_ADMIN",
          entityType: "Facture",
          entityId: fa.id,
          factureId: fa.id,
          details: {
            reason,
            sourceDevisId: plan.devis.id,
            sourceDevisNumero: plan.devis.numero,
            before,
            after,
          },
        },
      });
    }

    // Sanity check post-update : recompute par requête et compare
    const reverif = await tx.devis.findUnique({ where: { id: plan.devis.id } });
    if (!reverif) throw new Error("Devis disparu après update — rollback");
    if (Math.abs(reverif.totalHt - plan.recomputed.totalHt) > EPSILON) {
      throw new Error(
        `Sanity check : totalHt stocké (${reverif.totalHt}) != recomputed (${plan.recomputed.totalHt}). Rollback.`
      );
    }
  }, { timeout: 60_000 });
}

async function main() {
  const args = parseArgs();
  const targets = loadTargets(args);

  console.log(`\n${args.commit ? "COMMIT" : "DRY-RUN"} — restore-devis-taux`);
  console.log(`Cibles : ${targets.length} devis`);

  const plans: Plan[] = [];
  for (const t of targets) {
    if (!t.numero) {
      console.warn(`  ⚠ Ligne ignorée (numero vide)`);
      continue;
    }
    const d = await loadDevis(t);
    if (!d) {
      console.warn(`  ⚠ Devis ${t.numero} introuvable, skip.`);
      continue;
    }
    plans.push(buildPlan(d, t));
  }

  for (const p of plans) printPlan(p);

  const toApply = plans.filter((p) => p.changed.length > 0);
  console.log(`\n${toApply.length} devis avec changement à appliquer / ${plans.length} cibles.`);

  if (!args.commit) {
    console.log(`\nMode DRY-RUN. Pour exécuter : ajouter --commit (et idéalement --admin-email).`);
    return;
  }

  let nbDevis = 0;
  let nbFactures = 0;
  for (const p of toApply) {
    await commitPlan(p, args.reason, args.adminEmail);
    nbDevis++;
    nbFactures += p.facturesActionables.length;
    console.log(`  ✓ ${p.devis.numero} appliqué (${p.facturesActionables.length} facture(s) BROUILLON mises à jour)`);
  }

  console.log(`\n✓ Transaction terminée. ${nbDevis} devis modifiés, ${nbFactures} factures BROUILLON modifiées.`);
  console.log(`  AuditLogs créés : ${nbDevis + nbFactures}.`);
}

main()
  .catch((err) => {
    console.error("\nErreur fatale :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
