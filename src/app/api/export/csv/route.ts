import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function fmtNum(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields
    .map((f) => {
      const s = String(f ?? "");
      // Encapsuler si contient virgule, guillemet ou saut de ligne
      if (s.includes(";") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(";");
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth("facture:read");
    const { debut, fin } = parseRange(new URL(req.url));

    const factures = await prisma.facture.findMany({
      where: {
        companyId: user.companyId,
        dateEmission: { gte: debut, lte: fin },
        statut: { not: "BROUILLON" },
      },
      include: { client: { select: { name: true, siret: true } } },
      orderBy: { dateEmission: "asc" },
    });

    const headers = [
      "Numéro",
      "Date émission",
      "Échéance",
      "Client",
      "SIRET client",
      "Type",
      "Total HT",
      "TVA",
      "Total TTC",
      "Statut",
      "Date paiement",
    ];

    const rows = [
      csvRow(headers),
      ...factures.map((f) =>
        csvRow([
          f.numero,
          fmtDate(f.dateEmission),
          fmtDate(f.dateEcheance),
          f.client.name,
          f.client.siret ?? "",
          f.type,
          fmtNum(f.totalHt),
          fmtNum(f.tva),
          fmtNum(f.totalTtc),
          f.statut,
          fmtDate(f.datePaiement),
        ])
      ),
    ];

    // BOM UTF-8 pour compatibilité Excel
    const bom = "\uFEFF";
    const csv = bom + rows.join("\r\n");
    const debutStr = debut.toISOString().slice(0, 10);
    const finStr = fin.toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="factures-${debutStr}_${finStr}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}
export const dynamic = 'force-dynamic';
