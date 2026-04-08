import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { DevisPdf } from "@/components/devis/DevisPdf";
import { getNextDevisNumero } from "@/lib/numbering";
import React from "react";

// @react-pdf/renderer requires Node.js runtime (not Edge)
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("devis:read");
    const { id } = await params;

    const url = new URL(req.url);
    const docIds = url.searchParams.get("docs")?.split(",").filter(Boolean) ?? [];

    let devis = await prisma.devis.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        client: true,
        company: true,
        sections: {
          include: { lignes: { orderBy: { ordre: "asc" } } },
          orderBy: { ordre: "asc" },
        },
      },
    });

    if (!devis) {
      return Response.json({ error: "Devis introuvable" }, { status: 404 });
    }

    // Si le devis n'a pas encore de numéro, on l'assigne maintenant.
    // La génération d'un PDF est l'acte qui "matérialise" le document —
    // le numéro séquentiel est réservé définitivement à ce moment.
    if (!devis.numero) {
      const numero = await getNextDevisNumero(user.companyId);
      devis = await prisma.devis.update({
        where: { id },
        data: { numero, dateEmission: devis.dateEmission ?? new Date() },
        include: {
          client: true,
          company: true,
          sections: {
            include: { lignes: { orderBy: { ordre: "asc" } } },
            orderBy: { ordre: "asc" },
          },
        },
      });
    }

    // renderToBuffer attend un ReactElement<DocumentProps> — le cast est sûr
    // car DevisPdf retourne bien un <Document> au runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mainBuffer = await renderToBuffer(React.createElement(DevisPdf, { devis }) as any);

    const filename = devis.numero
      ? `devis-${devis.numero}.pdf`
      : `devis-brouillon-${devis.id.slice(0, 8)}.pdf`;

    if (docIds.length === 0) {
      return new Response(new Uint8Array(mainBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Fusionner avec pdf-lib
    const { PDFDocument } = await import("pdf-lib");
    const merged = await PDFDocument.create();

    // 1. Pages du devis
    const mainPdf = await PDFDocument.load(mainBuffer);
    const mainPages = await merged.copyPages(mainPdf, mainPdf.getPageIndices());
    mainPages.forEach((p) => merged.addPage(p));

    // 2. Documents joints (vérifier ownership)
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds }, companyId: user.companyId },
    });

    for (const doc of docs) {
      const res = await fetch(doc.url);
      if (!res.ok) continue;
      const docBuf = await res.arrayBuffer();
      const docPdf = await PDFDocument.load(docBuf);
      const pages = await merged.copyPages(docPdf, docPdf.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }

    const mergedBuf = await merged.save();

    return new Response(mergedBuf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleAuthError(err);
  }
}

export const dynamic = "force-dynamic";
