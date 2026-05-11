/**
 * scripts/diag-graph.ts
 * Liste toutes les factures avec statut PAYEE : numéro, client, TTC, dateReglement.
 *
 * Usage : npx tsx scripts/diag-graph.ts
 */

import * as dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function fmtEuros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquante dans .env.local");
    process.exit(1);
  }

  const factures = await prisma.facture.findMany({
    where: { statut: "PAYEE" },
    select: {
      numero: true,
      numeroBdc: true,
      totalTtc: true,
      dateReglement: true,
      client: { select: { name: true } },
      devis: { select: { numero: true } },
    },
    orderBy: [{ dateReglement: "asc" }, { numero: "asc" }],
  });

  console.log(`\n📊 ${factures.length} facture(s) PAYEE en base\n`);

  if (factures.length === 0) {
    console.log("Aucune facture payée trouvée.\n");
    await prisma.$disconnect();
    return;
  }

  const COLS = [
    { h: "N° Facture", w: 12 },
    { h: "N° BDC", w: 12 },
    { h: "N° Devis lié", w: 14 },
    { h: "Client", w: 32 },
    { h: "Total TTC", w: 14 },
    { h: "Date règlement", w: 14 },
  ];
  const header = COLS.map((c) => c.h.padEnd(c.w)).join("│ ");
  console.log(header);
  console.log("─".repeat(header.length));

  let withDate = 0;
  let withoutDate = 0;
  let totalAvecDate = 0;

  for (const f of factures) {
    const num = (f.numero ?? "—").padEnd(COLS[0].w).slice(0, COLS[0].w);
    const bdc = (f.numeroBdc ?? "—").padEnd(COLS[1].w).slice(0, COLS[1].w);
    const devNum = (f.devis?.numero ?? "—").padEnd(COLS[2].w).slice(0, COLS[2].w);
    const client = (f.client?.name ?? "—").padEnd(COLS[3].w).slice(0, COLS[3].w);
    const ttc = fmtEuros(f.totalTtc).padStart(COLS[4].w);
    const dr = fmtDate(f.dateReglement).padEnd(COLS[5].w);
    console.log(`${num}│ ${bdc}│ ${devNum}│ ${client}│ ${ttc}│ ${dr}`);
    if (f.dateReglement) {
      withDate++;
      totalAvecDate += f.totalTtc;
    } else {
      withoutDate++;
    }
  }

  console.log("─".repeat(header.length));
  console.log(
    `\nRésumé :`
  );
  console.log(`  • ${withDate} facture(s) PAYEE AVEC dateReglement   → total : ${fmtEuros(totalAvecDate)}`);
  console.log(`  • ${withoutDate} facture(s) PAYEE SANS dateReglement (invisibles dans le graphique)`);

  // Regroupement par mois pour les 6 derniers mois (même logique que le dashboard)
  const now = new Date();
  const startOf6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const MOIS_FR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  const caParMois = new Map<string, { label: string; ca: number; nb: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    caParMois.set(key, { label: `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`, ca: 0, nb: 0 });
  }
  for (const f of factures) {
    if (!f.dateReglement) continue;
    const d = new Date(f.dateReglement);
    if (d < startOf6Months) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const cur = caParMois.get(key);
    if (cur) {
      cur.ca += f.totalTtc;
      cur.nb += 1;
    }
  }

  console.log(`\n📈 CA encaissé par mois (6 derniers mois, comme le graphique) :`);
  for (const v of caParMois.values()) {
    console.log(`  ${v.label.padEnd(10)} → ${fmtEuros(v.ca).padStart(14)}  (${v.nb} facture(s))`);
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Erreur :", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
