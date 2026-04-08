export const runtime = "nodejs";

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FacturePdf } from "@/components/factures/FacturePdf";
import React from "react";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:read");
    const { id } = await params;

    const url = new URL(req.url);
    const docIds = url.searchParams.get("docs")?.split(",").filter(Boolean) ?? [];

    const [facture, company] = await Promise.all([
      prisma.facture.findFirst({
        where: { id, companyId: user.companyId },
        include: {
          client: true,
          devis: { select: { numero: true, objet: true } },
        },
      }),
      prisma.company.findUnique({
        where: { id: user.companyId },
        select: { logoUrl: true },
      }),
    ]);

    if (!facture) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    // Normalise devis.numero (string | null → string) pour satisfaire FactureForPdf
    const devisNormalized = facture.devis
      ? { ...facture.devis, numero: facture.devis.numero ?? "" }
      : null;
    const factureWithLogo = {
      ...facture,
      devis: devisNormalized,
      logoUrl: company?.logoUrl ?? null,
    };

    const mainBuffer = await renderToBuffer(
      React.createElement(FacturePdf, { facture: factureWithLogo }) as never
    );

    const filename = `facture-${facture.numero.replace(/\//g, "-")}.pdf`;

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

    // 1. Pages de la facture
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
