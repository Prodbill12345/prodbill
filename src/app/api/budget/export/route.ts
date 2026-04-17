import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

// ─── Styles ──────────────────────────────────────────────────────────────────

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
const NUM_FMT = "#,##0.00";
const PCT_FMT = "0%";

function autoWidth(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 45);
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

const STATUT_DEVIS: Record<string, string> = {
  BROUILLON: "Brouillon",
  ENVOYE: "Envoyé",
  ACCEPTE: "Accepté",
  REFUSE: "Refusé",
  EXPIRE: "Expiré",
};
const TYPE_FACTURE: Record<string, string> = {
  ACOMPTE: "Acompte",
  SOLDE: "Solde",
  AVOIR: "Avoir",
};
const STATUT_FACTURE: Record<string, string> = {
  BROUILLON: "Brouillon",
  EMISE: "Émise",
  PAYEE_PARTIEL: "Payée partiellement",
  PAYEE: "Payée",
  EN_RETARD: "En retard",
  ANNULEE: "Annulée",
};

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const user = await requireAuth("devis:read");
    const url = new URL(req.url);
    const annee = parseInt(url.searchParams.get("annee") ?? String(new Date().getFullYear()), 10);

    // ── Fetch toutes les données ─────────────────────────────────────────────
    const [budget, devis, factures, agents, comediens] = await Promise.all([
      prisma.budgetPrevisionnel.findUnique({
        where: { companyId_annee: { companyId: user.companyId, annee } },
        include: {
          lignes: {
            include: { client: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.devis.findMany({
        where: { companyId: user.companyId },
        include: {
          client: { select: { id: true, name: true } },
          sections: { include: { lignes: true }, orderBy: { ordre: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.facture.findMany({
        where: { companyId: user.companyId },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.agent.findMany({
        where: { companyId: user.companyId },
        select: { id: true, nom: true, prenom: true, agence: true, tauxCommission: true },
        orderBy: [{ agence: "asc" }, { nom: "asc" }],
      }),
      prisma.comedien.findMany({
        where: { companyId: user.companyId },
        select: { id: true, prenom: true, nom: true, agentId: true },
        orderBy: [{ nom: "asc" }, { prenom: "asc" }],
      }),
    ]);

    // CA réalisé par clientId pour le budget prévisionnel (factures PAYEE/PAYEE_PARTIEL de l'année)
    const caParClientId: Record<string, number> = {};
    for (const f of factures) {
      if (
        (f.statut === "PAYEE" || f.statut === "PAYEE_PARTIEL") &&
        f.dateEmission &&
        new Date(f.dateEmission).getFullYear() === annee
      ) {
        caParClientId[f.client.id] = (caParClientId[f.client.id] ?? 0) + f.totalHt;
      }
    }

    // ── Workbook ─────────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "ProdBill";
    wb.created = new Date();

    // ════════════════════════════════════════════════════════════════════════
    // Onglet 1 — Devis
    // ════════════════════════════════════════════════════════════════════════
    const shDevis = wb.addWorksheet("Devis");
    addHeader(shDevis, [
      "N° Devis", "Date", "Client", "Nom projet", "Date séance", "Statut", "% PIPE",
      "Sous-total HT", "CS Artistes", "CS Tech", "Frais généraux", "Marge",
      "Indexation artiste", "Indexation musique", "Agent voix-off",
      "Total HT", "TVA", "Total TTC",
    ]);

    for (const d of devis) {
      const allLignes = d.sections.flatMap((s) => s.lignes);
      const indexArtiste = allLignes
        .filter((l) => l.tag === "ARTISTE")
        .reduce((s, l) => s + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0);
      const indexMusique = allLignes
        .filter((l) => l.tag === "MUSIQUE")
        .reduce((s, l) => s + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0);
      const agentVoixOff = allLignes
        .filter((l) => l.tag === "AGENT")
        .reduce((s, l) => s + l.quantite * l.prixUnit, 0);

      const row = shDevis.addRow([
        d.numero ?? "Brouillon",
        fmtDate(d.dateEmission ?? d.createdAt),
        d.client.name,
        d.nomProjet ?? "",
        fmtDate(d.dateSeance),
        STATUT_DEVIS[d.statut] ?? d.statut,
        (d.tauxPipe ?? 0) / 100,
        d.sousTotal,
        d.csComedien,
        d.csTechniciens,
        d.fraisGeneraux,
        d.marge,
        Math.round(indexArtiste * 100) / 100,
        Math.round(indexMusique * 100) / 100,
        Math.round(agentVoixOff * 100) / 100,
        d.totalHt,
        d.tva,
        d.totalTtc,
      ]);
      row.getCell(7).numFmt = PCT_FMT;
      for (let c = 8; c <= 18; c++) row.getCell(c).numFmt = NUM_FMT;
    }
    autoWidth(shDevis);

    // ════════════════════════════════════════════════════════════════════════
    // Onglet 2 — Factures
    // ════════════════════════════════════════════════════════════════════════
    const shFactures = wb.addWorksheet("Factures");
    addHeader(shFactures, [
      "N° Facture", "Date émission", "Client", "N° BDC", "Type",
      "Statut paiement", "Date règlement", "Montant HT", "TVA", "Montant TTC",
    ]);

    for (const f of factures) {
      const row = shFactures.addRow([
        f.numero,
        fmtDate(f.dateEmission),
        f.client.name,
        f.numeroBdc ?? "",
        TYPE_FACTURE[f.type] ?? f.type,
        STATUT_FACTURE[f.statut] ?? f.statut,
        fmtDate(f.dateReglement),
        f.totalHt,
        f.tva,
        f.totalTtc,
      ]);
      for (let c = 8; c <= 10; c++) row.getCell(c).numFmt = NUM_FMT;
    }
    autoWidth(shFactures);

    // ════════════════════════════════════════════════════════════════════════
    // Onglet 3 — Budget prévisionnel
    // ════════════════════════════════════════════════════════════════════════
    const shBudget = wb.addWorksheet("Budget prévisionnel");
    addHeader(shBudget, [
      "Client", "Libellé", "Commercial", "Montant prévisionnel", "CA réalisé", "% Atteinte",
    ]);

    const lignes = budget?.lignes ?? [];
    for (const l of lignes) {
      const ca = caParClientId[l.clientId] ?? 0;
      const pct = l.montantPrevisionnel > 0 ? ca / l.montantPrevisionnel : 0;
      const row = shBudget.addRow([
        l.client.name,
        l.libelle,
        (l as typeof l & { nomCommercial?: string | null }).nomCommercial ?? "",
        l.montantPrevisionnel,
        ca,
        pct,
      ]);
      row.getCell(4).numFmt = NUM_FMT;
      row.getCell(5).numFmt = NUM_FMT;
      row.getCell(6).numFmt = PCT_FMT;
    }
    // Ligne total
    const totalPrev = lignes.reduce((s, l) => s + l.montantPrevisionnel, 0);
    const totalCa = lignes.reduce((s, l) => s + (caParClientId[l.clientId] ?? 0), 0);
    if (lignes.length > 0) {
      const totRow = shBudget.addRow([
        "TOTAL", "", "", totalPrev, totalCa, totalPrev > 0 ? totalCa / totalPrev : 0,
      ]);
      totRow.font = { bold: true };
      totRow.getCell(4).numFmt = NUM_FMT;
      totRow.getCell(5).numFmt = NUM_FMT;
      totRow.getCell(6).numFmt = PCT_FMT;
    }
    autoWidth(shBudget);

    // ════════════════════════════════════════════════════════════════════════
    // Onglet 4 — Pipe
    // ════════════════════════════════════════════════════════════════════════
    const shPipe = wb.addWorksheet("Pipe");
    addHeader(shPipe, ["N° Devis", "Client", "Objet", "Statut", "Montant HT", "% PIPE", "Montant pondéré"]);

    for (const d of devis) {
      const pipe = d.tauxPipe ?? 0;
      const row = shPipe.addRow([
        d.numero ?? "Brouillon",
        d.client.name,
        d.objet,
        STATUT_DEVIS[d.statut] ?? d.statut,
        d.totalHt,
        pipe / 100,
        (d.totalHt * pipe) / 100,
      ]);
      row.getCell(5).numFmt = NUM_FMT;
      row.getCell(6).numFmt = PCT_FMT;
      row.getCell(7).numFmt = NUM_FMT;
    }
    const totalPondere = devis.reduce((s, d) => s + (d.totalHt * (d.tauxPipe ?? 0)) / 100, 0);
    const pipeTotal = shPipe.addRow(["TOTAL", "", "", "", "", "", totalPondere]);
    pipeTotal.font = { bold: true };
    pipeTotal.getCell(7).numFmt = NUM_FMT;
    autoWidth(shPipe);

    // ════════════════════════════════════════════════════════════════════════
    // Onglet 5 — Agents
    // ════════════════════════════════════════════════════════════════════════
    const shAgents = wb.addWorksheet("Agents");
    addHeader(shAgents, [
      "Agent", "Agence", "Comédiens associés", "Nb devis", "Montant HT total", "Commission estimée",
    ]);

    // Indexer les lignes par agentId
    type AgentStats = { montantHt: number; devisIds: Set<string> };
    const lignesByAgent: Record<string, AgentStats> = {};
    for (const d of devis) {
      for (const s of d.sections) {
        for (const l of s.lignes) {
          if (!l.agentId) continue;
          if (!lignesByAgent[l.agentId]) lignesByAgent[l.agentId] = { montantHt: 0, devisIds: new Set() };
          lignesByAgent[l.agentId].montantHt += l.quantite * l.prixUnit;
          lignesByAgent[l.agentId].devisIds.add(d.id);
        }
      }
    }

    for (const agent of agents) {
      const stats = lignesByAgent[agent.id];
      const montantHt = stats?.montantHt ?? 0;
      const nbDevis = stats?.devisIds.size ?? 0;
      const commission = (montantHt * agent.tauxCommission) / 100;
      const comediensList = comediens
        .filter((c) => c.agentId === agent.id)
        .map((c) => `${c.prenom} ${c.nom}`)
        .join(", ");

      const row = shAgents.addRow([
        agent.prenom ? `${agent.prenom} ${agent.nom}` : agent.nom,
        agent.agence ?? "",
        comediensList,
        nbDevis,
        montantHt,
        commission,
      ]);
      row.getCell(5).numFmt = NUM_FMT;
      row.getCell(6).numFmt = NUM_FMT;
    }
    autoWidth(shAgents);

    // ── Réponse ──────────────────────────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="export-prodbill-${annee}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
