import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E293B" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  color: { argb: "FFFFFFFF" },
  bold: true,
  size: 10,
};
const CURRENCY_FMT = '#,##0.00 "€"';

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 40);
  });
}

function addHeader(sheet: ExcelJS.Worksheet, headers: string[]) {
  const row = sheet.addRow(headers);
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle" };
  });
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth("devis:read");
    const url = new URL(req.url);
    const annee = parseInt(url.searchParams.get("annee") ?? String(new Date().getFullYear()), 10);

    // ── Données ─────────────────────────────────────────────────────────────
    const [budget, devis, factures, agents] = await Promise.all([
      prisma.budgetPrevisionnel.findUnique({
        where: { companyId_annee: { companyId: user.companyId, annee } },
        include: {
          lignes: { include: { client: true } },
        },
      }),
      prisma.devis.findMany({
        where: { companyId: user.companyId },
        include: {
          client: { select: { id: true, name: true } },
          sections: { include: { lignes: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.facture.findMany({
        where: {
          companyId: user.companyId,
          statut: { in: ["PAYEE", "PAYEE_PARTIEL"] },
          dateEmission: {
            gte: new Date(annee, 0, 1),
            lte: new Date(annee, 11, 31, 23, 59, 59),
          },
        },
        select: { clientId: true, totalHt: true },
      }),
      prisma.agent.findMany({
        where: { companyId: user.companyId },
        select: { id: true, nom: true, prenom: true, agence: true, tauxCommission: true },
        orderBy: [{ agence: "asc" }, { nom: "asc" }],
      }),
    ]);

    // CA réalisé par client
    const caParClient: Record<string, number> = {};
    for (const f of factures) {
      caParClient[f.clientId] = (caParClient[f.clientId] ?? 0) + f.totalHt;
    }

    // ── Workbook ─────────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "ProdBill";
    wb.created = new Date();

    // ── Onglet 1 : Budget prévisionnel ───────────────────────────────────────
    const sh1 = wb.addWorksheet("Budget prévisionnel");
    addHeader(sh1, ["Client", "Libellé", "Prévisionnel HT", "CA Réalisé HT", "% Atteinte"]);
    const lignes = budget?.lignes ?? [];
    for (const l of lignes) {
      const ca = caParClient[l.clientId] ?? 0;
      const pct = l.montantPrevisionnel > 0 ? Math.round((ca / l.montantPrevisionnel) * 100) : 0;
      const row = sh1.addRow([l.client.name, l.libelle, l.montantPrevisionnel, ca, pct / 100]);
      row.getCell(3).numFmt = CURRENCY_FMT;
      row.getCell(4).numFmt = CURRENCY_FMT;
      row.getCell(5).numFmt = "0%";
    }
    // Total
    const totalPrev = lignes.reduce((s, l) => s + l.montantPrevisionnel, 0);
    const totalCa = lignes.reduce((s, l) => s + (caParClient[l.clientId] ?? 0), 0);
    const totalRow = sh1.addRow(["TOTAL", "", totalPrev, totalCa, totalPrev > 0 ? totalCa / totalPrev : 0]);
    totalRow.font = { bold: true };
    totalRow.getCell(3).numFmt = CURRENCY_FMT;
    totalRow.getCell(4).numFmt = CURRENCY_FMT;
    totalRow.getCell(5).numFmt = "0%";
    autoWidth(sh1);

    // ── Onglet 2 : Pipe devis ────────────────────────────────────────────────
    const sh2 = wb.addWorksheet("Pipe devis");
    addHeader(sh2, ["Numéro", "Client", "Objet", "Statut", "Total HT", "% PIPE", "Montant pondéré"]);
    for (const d of devis) {
      const pipe = d.tauxPipe ?? 0;
      const row = sh2.addRow([
        d.numero ?? "Brouillon",
        d.client.name,
        d.objet,
        d.statut,
        d.totalHt,
        pipe / 100,
        (d.totalHt * pipe) / 100,
      ]);
      row.getCell(5).numFmt = CURRENCY_FMT;
      row.getCell(6).numFmt = "0%";
      row.getCell(7).numFmt = CURRENCY_FMT;
    }
    const totalPondere = devis.reduce((s, d) => s + (d.totalHt * (d.tauxPipe ?? 0)) / 100, 0);
    const pipe2Row = sh2.addRow(["TOTAL", "", "", "", "", "", totalPondere]);
    pipe2Row.font = { bold: true };
    pipe2Row.getCell(7).numFmt = CURRENCY_FMT;
    autoWidth(sh2);

    // ── Onglet 3 : Bénéfice net ──────────────────────────────────────────────
    const sh3 = wb.addWorksheet("Bénéfice net");
    addHeader(sh3, ["Numéro", "Client", "Objet", "Total HT", "Salaires artistes", "Indexation artiste", "CS Artistes", "Agent voix-off", "Coûts artistes", "Bénéfice net", "Marge nette %"]);
    for (const d of devis) {
      const allLignes = d.sections.flatMap((s) => s.lignes);
      const salaires = allLignes.filter((l) => l.tag === "ARTISTE").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
      const indexation = allLignes.filter((l) => l.tag === "ARTISTE").reduce((s, l) => s + l.total * (l.tauxIndexation ?? 0) / 100, 0);
      const csArtistes = d.csComedien;
      const agent = allLignes.filter((l) => l.tag === "AGENT").reduce((s, l) => s + l.quantite * l.prixUnit, 0);
      const couts = salaires + indexation + csArtistes + agent;
      const benefice = d.totalHt - couts;
      const marge = d.totalHt > 0 ? benefice / d.totalHt : 0;
      const row = sh3.addRow([
        d.numero ?? "Brouillon",
        d.client.name,
        d.objet,
        d.totalHt,
        salaires,
        indexation,
        csArtistes,
        agent,
        couts,
        benefice,
        marge,
      ]);
      for (let c = 4; c <= 10; c++) row.getCell(c).numFmt = CURRENCY_FMT;
      row.getCell(11).numFmt = "0.0%";
    }
    autoWidth(sh3);

    // ── Onglet 4 : Agents ────────────────────────────────────────────────────
    const sh4 = wb.addWorksheet("Agents");
    addHeader(sh4, ["Agent", "Agence", "Taux commission", "Nb devis", "Montant HT total", "Commission estimée"]);
    const allLignesByAgent: Record<string, { montantHt: number; devisIds: Set<string> }> = {};
    for (const d of devis) {
      for (const s of d.sections) {
        for (const l of s.lignes) {
          if (!l.agentId) continue;
          if (!allLignesByAgent[l.agentId]) {
            allLignesByAgent[l.agentId] = { montantHt: 0, devisIds: new Set() };
          }
          allLignesByAgent[l.agentId].montantHt += l.quantite * l.prixUnit;
          allLignesByAgent[l.agentId].devisIds.add(d.id);
        }
      }
    }
    for (const agent of agents) {
      const stats = allLignesByAgent[agent.id];
      const montantHt = stats?.montantHt ?? 0;
      const nbDevis = stats?.devisIds.size ?? 0;
      const commission = (montantHt * agent.tauxCommission) / 100;
      const row = sh4.addRow([
        agent.prenom ? `${agent.prenom} ${agent.nom}` : agent.nom,
        agent.agence ?? "",
        agent.tauxCommission / 100,
        nbDevis,
        montantHt,
        commission,
      ]);
      row.getCell(3).numFmt = "0%";
      row.getCell(5).numFmt = CURRENCY_FMT;
      row.getCell(6).numFmt = CURRENCY_FMT;
    }
    autoWidth(sh4);

    // ── Réponse ──────────────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="budget-${annee}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
