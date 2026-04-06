import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Export FEC (Fichier des Écritures Comptables)
 * Format légal défini par l'arrêté du 29 juillet 2013 (art. A47 A-1 LPF)
 *
 * Chaque facture génère 3 écritures :
 *   411xxx  (Client)              DÉBIT  = TTC
 *   706000  (Prestations)         CRÉDIT = HT
 *   445710  (TVA collectée)       CRÉDIT = TVA
 *
 * Chaque paiement génère 2 écritures :
 *   512000  (Banque)              DÉBIT  = montant
 *   411xxx  (Client)              CRÉDIT = montant
 */

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

/** YYYYMMDD requis par le FEC */
function fecDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const j = String(dt.getDate()).padStart(2, "0");
  return `${y}${m}${j}`;
}

/** Montant FEC : virgule comme séparateur décimal, 2 décimales */
function fecNum(n: number): string {
  return Math.abs(n).toFixed(2).replace(".", ",");
}

/** Pipe-délimité sans espaces superflus */
function fecRow(cols: string[]): string {
  return cols.join("|");
}

/** Numéro de compte client : 411 + 6 premiers chiffres du SIRET (ou générique) */
function compte411(siret: string | null | undefined): string {
  const digits = (siret ?? "").replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return `411${digits}`;
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth("facture:read");
    const { debut, fin } = parseRange(new URL(req.url));

    const [factures, paiements] = await Promise.all([
      prisma.facture.findMany({
        where: {
          companyId: user.companyId,
          dateEmission: { gte: debut, lte: fin },
          statut: { not: "BROUILLON" },
          type: { not: "AVOIR" }, // les avoirs sont gérés séparément ci-dessous
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
          facture: {
            include: { client: { select: { name: true, siret: true } } },
          },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    // En-tête FEC (16 colonnes obligatoires)
    const FEC_HEADER = fecRow([
      "JournalCode", "JournalLib", "EcritureNum", "EcritureDate",
      "CompteNum", "CompteLib", "PieceRef", "PieceDate",
      "EcritureLib", "Debit", "Credit",
      "EcritureLet", "DateLet", "ValidDate",
      "Montantdevise", "Idevise",
    ]);

    const lines: string[] = [FEC_HEADER];
    let seq = 1;
    const exercice = debut.getFullYear().toString().slice(-2);

    function nextNum() {
      return `${exercice}VT${String(seq++).padStart(6, "0")}`;
    }
    function nextBQ() {
      return `${exercice}BQ${String(seq++).padStart(6, "0")}`;
    }

    const validDate = fecDate(new Date()); // date de validation = aujourd'hui

    // ── Écritures de vente (une facture = 3 lignes) ──────────────────────────
    for (const f of factures) {
      const dateEcr = fecDate(f.dateEmission);
      const pieceDate = fecDate(f.dateEmission);
      const cptClient = compte411(f.client.siret);
      const libClient = f.client.name.toUpperCase().slice(0, 35);
      const ecritureNum = nextNum();
      const libEcriture = `FAC ${f.numero}`.slice(0, 35);
      const isAvoir = f.totalHt < 0;

      if (isAvoir) {
        // Avoir : sens inversé
        // 411 CRÉDIT, 706 DÉBIT, 44571 DÉBIT
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, cptClient, libClient, f.numero, pieceDate, libEcriture, "0,00", fecNum(f.totalTtc), "", "", validDate, "", ""]));
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, "706000", "PRESTATIONS DE SERVICES", f.numero, pieceDate, libEcriture, fecNum(f.totalHt), "0,00", "", "", validDate, "", ""]));
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, "445710", "TVA COLLECTÉE 20%", f.numero, pieceDate, libEcriture, fecNum(f.tva), "0,00", "", "", validDate, "", ""]));
      } else {
        // Facture normale
        // 411 DÉBIT TTC | 706 CRÉDIT HT | 44571 CRÉDIT TVA
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, cptClient, libClient, f.numero, pieceDate, libEcriture, fecNum(f.totalTtc), "0,00", "", "", validDate, "", ""]));
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, "706000", "PRESTATIONS DE SERVICES", f.numero, pieceDate, libEcriture, "0,00", fecNum(f.totalHt), "", "", validDate, "", ""]));
        lines.push(fecRow([ecritureNum, "Journal des ventes", ecritureNum, dateEcr, "445710", "TVA COLLECTÉE 20%", f.numero, pieceDate, libEcriture, "0,00", fecNum(f.tva), "", "", validDate, "", ""]));
      }
    }

    // ── Écritures de paiement (un paiement = 2 lignes) ───────────────────────
    for (const p of paiements) {
      const dateEcr = fecDate(p.date);
      const ecritureNum = nextBQ();
      const cptClient = compte411(p.facture.client.siret);
      const libClient = p.facture.client.name.toUpperCase().slice(0, 35);
      const libEcriture = `REG ${p.facture.numero}`.slice(0, 35);

      // 512 DÉBIT | 411 CRÉDIT
      lines.push(fecRow([ecritureNum, "Journal de banque", ecritureNum, dateEcr, "512000", "BANQUE", p.reference ?? p.facture.numero, dateEcr, libEcriture, fecNum(p.montant), "0,00", "", "", validDate, "", ""]));
      lines.push(fecRow([ecritureNum, "Journal de banque", ecritureNum, dateEcr, cptClient, libClient, p.reference ?? p.facture.numero, dateEcr, libEcriture, "0,00", fecNum(p.montant), "", "", validDate, "", ""]));
    }

    const debutStr = debut.toISOString().slice(0, 10);
    const finStr = fin.toISOString().slice(0, 10);
    // FEC : UTF-8, séparateur pipe, fin de ligne \r\n, pas de BOM
    const content = lines.join("\r\n");

    return new Response(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="FEC-${debutStr}_${finStr}.txt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
