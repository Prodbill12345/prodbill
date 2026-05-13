import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const devisAvecRemise = await prisma.devis.findMany({
    where: { remise: { gt: 0 } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: { company: { select: { name: true } } },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  });

  console.log(`\n${devisAvecRemise.length} devis avec remise > 0 trouvés.\n`);

  for (const d of devisAvecRemise) {
    console.log(`─── ${d.company.name} / Devis ${d.numero ?? d.id} (${d.objet}) ───`);
    console.log(`  sousTotal        ${d.sousTotal.toFixed(2)} €`);
    console.log(`  csComedien       ${d.csComedien.toFixed(2)} €`);
    console.log(`  csTechniciens    ${d.csTechniciens.toFixed(2)} €`);
    console.log(`  fraisGeneraux    ${d.fraisGeneraux.toFixed(2)} €`);
    console.log(`  marge            ${d.marge.toFixed(2)} €`);
    console.log(`  totalHt (brut)   ${d.totalHt.toFixed(2)} €  ← stocké AVANT remise`);
    console.log(`  remise           -${d.remise.toFixed(2)} €`);
    console.log(`  coproduction     -${d.coproduction.toFixed(2)} €`);
    console.log(`  totalApresRemise ${d.totalApresRemise.toFixed(2)} €  ← HT net`);
    console.log(`  tva 20%          ${d.tva.toFixed(2)} €  (= totalApresRemise × 20%)`);
    console.log(`  totalTtc         ${d.totalTtc.toFixed(2)} €`);

    // Vérif math
    const expectedNet = d.totalHt - d.remise - d.coproduction;
    const expectedTva = Math.round(expectedNet * 0.2 * 100) / 100;
    const expectedTtc = Math.round((expectedNet + expectedTva) * 100) / 100;
    console.log(
      `  → check : net=${expectedNet.toFixed(2)}, tva=${expectedTva.toFixed(2)}, ttc=${expectedTtc.toFixed(2)}`
    );
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
