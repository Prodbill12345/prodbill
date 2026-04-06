import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

function parseRange(url: URL): { debut: Date; fin: Date } {
  const debut = new Date(url.searchParams.get("debut") ?? "");
  const fin = new Date(url.searchParams.get("fin") ?? "");
  if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
    const now = new Date();
    return {
      debut: new Date(now.getFullYear(), now.getMonth(), 1),
      fin: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
    };
  }
  fin.setHours(23, 59, 59, 999);
  return { debut, fin };
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
}

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

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  row.height = 22;
}

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value?.toString() ?? "";
      if (v.length > max) max = v.length;
    });
    col.width = Math.min(max + 2, 40);
  });
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth("facture:read");
    const { debut, fin } = parseRange(new URL(req.url));

    const [factures, paiements, devis] = await Promise.all([
      prisma.facture.findMany({
        where: {
          companyId: user.companyId,
          dateEmission: { gte: debut, lte: fin },
          statut: { not: "BROUILLON" },
        },
        include: { client: { select: { name: true, siret: true } } },
        orderBy: { dateEmission: "asc" },
      }),
      prisma.paiement.findMany({
        where: {
          facture: { companyId: user.companyId },
          date: { gte: debut, lte: fin },
        },
        include: {
          facture: { include: { client: { select: { name: true } } } },
        },
        orderBy: { date: "asc" },
      }),
      prisma.devis.findMany({
        where: {
          companyId: user.companyId,
          createdAt: { gte: debut, lte: fin },
        },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "ProdBill";
    wb.created = new Date();

    // ── Onglet Factures ──────────────────────────────────────────────────────
    const wsF = wb.addWorksheet("Factures");
    wsF.columns = [
      { header: "Numéro",        key: "numero" },
      { header: "Date émission", key: "date" },
      { header: "Échéance",      key: "echeance" },
      { header: "Client",        key: "client" },
      { header: "SIRET client",  key: "siret" },
      { header: "Type",          key: "type" },
      { header: "HT (€)",        key: "ht",  style: { numFmt: '#,##0.00 "€"' } },
      { header: "TVA (€)",       key: "tva", style: { numFmt: '#,##0.00 "€"' } },
      { header: "TTC (€)",       key: "ttc", style: { numFmt: '#,##0.00 "€"' } },
      { header: "Statut",        key: "statut" },
      { header: "Date paiement", key: "datePaiement" },
    ];
    styleHeader(wsF.getRow(1));
    for (const f of factures) {
      wsF.addRow({
        numero: f.numero,
        date: fmtDate(f.dateEmission),
        echeance: fmtDate(f.dateEcheance),
        client: f.client.name,
        siret: f.client.siret ?? "",
        type: f.type,
        ht: f.totalHt,
        tva: f.tva,
        ttc: f.totalTtc,
        statut: f.statut,
        datePaiement: fmtDate(f.datePaiement),
      });
    }
    autoWidth(wsF);

    // ── Onglet Paiements ─────────────────────────────────────────────────────
    const wsP = wb.addWorksheet("Paiements");
    wsP.columns = [
      { header: "Date",      key: "date" },
      { header: "Facture",   key: "facture" },
      { header: "Client",    key: "client" },
      { header: "Montant (€)", key: "montant", style: { numFmt: '#,##0.00 "€"' } },
      { header: "Mode",      key: "mode" },
      { header: "Référence", key: "reference" },
    ];
    styleHeader(wsP.getRow(1));
    for (const p of paiements) {
      wsP.addRow({
        date: fmtDate(p.date),
        facture: p.facture.numero,
        client: p.facture.client.name,
        montant: p.montant,
        mode: p.mode ?? "",
        reference: p.reference ?? "",
      });
    }
    autoWidth(wsP);

    // ── Onglet CA mensuel ────────────────────────────────────────────────────
    const wsCA = wb.addWorksheet("CA mensuel");
    wsCA.columns = [
      { header: "Mois",    key: "mois" },
      { header: "HT (€)",  key: "ht",  style: { numFmt: '#,##0.00 "€"' } },
      { header: "TVA (€)", key: "tva", style: { numFmt: '#,##0.00 "€"' } },
      { header: "TTC (€)", key: "ttc", style: { numFmt: '#,##0.00 "€"' } },
      { header: "Nb factures", key: "nb" },
    ];
    styleHeader(wsCA.getRow(1));

    // Grouper par mois (basé sur dateEmission des factures émises)
    const caMap = new Map<string, { ht: number; tva: number; ttc: number; nb: number }>();
    for (const f of factures.filter((f) => f.statut !== "ANNULEE")) {
      if (!f.dateEmission) continue;
      const d = new Date(f.dateEmission);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prev = caMap.get(key) ?? { ht: 0, tva: 0, ttc: 0, nb: 0 };
      caMap.set(key, {
        ht: prev.ht + f.totalHt,
        tva: prev.tva + f.tva,
        ttc: prev.ttc + f.totalTtc,
        nb: prev.nb + 1,
      });
    }
    const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
    for (const [key, val] of Array.from(caMap.entries()).sort()) {
      const [y, m] = key.split("-");
      wsCA.addRow({
        mois: `${MOIS_FR[parseInt(m) - 1]} ${y}`,
        ht: Math.round(val.ht * 100) / 100,
        tva: Math.round(val.tva * 100) / 100,
        ttc: Math.round(val.ttc * 100) / 100,
        nb: val.nb,
      });
    }
    // Ligne totaux
    const totRow = wsCA.addRow({
      mois: "TOTAL",
      ht: { formula: `SUM(B2:B${wsCA.rowCount})` },
      tva: { formula: `SUM(C2:C${wsCA.rowCount})` },
      ttc: { formula: `SUM(D2:D${wsCA.rowCount})` },
      nb: { formula: `SUM(E2:E${wsCA.rowCount})` },
    });
    totRow.font = { bold: true };
    autoWidth(wsCA);

    // ── Onglet Devis ─────────────────────────────────────────────────────────
    const wsD = wb.addWorksheet("Devis");
    wsD.columns = [
      { header: "Numéro",  key: "numero" },
      { header: "Date",    key: "date" },
      { header: "Client",  key: "client" },
      { header: "Objet",   key: "objet" },
      { header: "HT (€)",  key: "ht",  style: { numFmt: '#,##0.00 "€"' } },
      { header: "TTC (€)", key: "ttc", style: { numFmt: '#,##0.00 "€"' } },
      { header: "Statut",  key: "statut" },
    ];
    styleHeader(wsD.getRow(1));
    for (const d of devis) {
      wsD.addRow({
        numero: d.numero ?? "Brouillon",
        date: fmtDate(d.createdAt),
        client: d.client.name,
        objet: d.objet,
        ht: d.totalHt,
        ttc: d.totalTtc,
        statut: d.statut,
      });
    }
    autoWidth(wsD);

    // ── Génération du buffer ─────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const debutStr = debut.toISOString().slice(0, 10);
    const finStr = fin.toISOString().slice(0, 10);

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="export-${debutStr}_${finStr}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
