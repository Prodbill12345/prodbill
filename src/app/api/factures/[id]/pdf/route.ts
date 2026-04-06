export const runtime = "nodejs";

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FacturePdf } from "@/components/factures/FacturePdf";
import React from "react";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth("facture:read");
    const { id } = await params;

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

    const buffer = await renderToBuffer(
      React.createElement(FacturePdf, { facture: factureWithLogo }) as never
    );

    const filename = `facture-${facture.numero.replace(/\//g, "-")}.pdf`;

    return new Response(new Uint8Array(buffer), {
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
export const dynamic = 'force-dynamic';
