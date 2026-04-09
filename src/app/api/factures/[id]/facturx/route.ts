export const runtime = "nodejs";

import { requireAuth, handleAuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FacturePdf } from "@/components/factures/FacturePdf";
import React from "react";

function buildFacturXml(facture: {
  numero: string;
  dateEmission: Date | null;
  totalHt: number;
  tva: number;
  totalTtc: number;
  nomEmetteur: string;
  adresseEmetteur: string;
  siretEmetteur: string;
  tvaIntraEmetteur: string;
  ibanEmetteur: string;
  client: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    siret: string | null;
  };
}): string {
  const dateStr = facture.dateEmission
    ? facture.dateEmission.toISOString().slice(0, 10).replace(/-/g, "")
    : new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const fmt = (n: number) => n.toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:minimum</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${facture.numero}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dateStr}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>

      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(facture.nomEmetteur)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(facture.adresseEmetteur)}</ram:LineOne>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${escapeXml(facture.siretEmetteur)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        ${facture.tvaIntraEmetteur ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(facture.tvaIntraEmetteur)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(facture.client.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escapeXml(facture.client.address)}</ram:LineOne>
          <ram:PostcodeCode>${escapeXml(facture.client.postalCode)}</ram:PostcodeCode>
          <ram:CityName>${escapeXml(facture.client.city)}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${facture.client.siret ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${escapeXml(facture.client.siret)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:BuyerTradeParty>

    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>

      ${facture.ibanEmetteur ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${escapeXml(facture.ibanEmetteur)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ""}

      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(facture.tva)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:ExemptionReason>Exonération TVA — production audiovisuelle</ram:ExemptionReason>
        <ram:BasisAmount>${fmt(facture.totalHt)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>

      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dateStr}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>

      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(facture.totalHt)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(facture.totalHt)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${fmt(facture.tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(facture.totalTtc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmt(facture.totalTtc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>

    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>

</rsm:CrossIndustryInvoice>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(
  req: Request,
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

    const devisNormalized = facture.devis
      ? { ...facture.devis, numero: facture.devis.numero ?? "" }
      : null;
    const factureWithLogo = {
      ...facture,
      devis: devisNormalized,
      logoUrl: company?.logoUrl ?? null,
    };

    // 1. Générer le PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(FacturePdf, { facture: factureWithLogo }) as never
    );

    // 2. Générer le XML Factur-X (profil MINIMUM EN 16931)
    const xmlString = buildFacturXml({
      numero: facture.numero,
      dateEmission: facture.dateEmission,
      totalHt: facture.totalHt,
      tva: facture.tva,
      totalTtc: facture.totalTtc,
      nomEmetteur: facture.nomEmetteur,
      adresseEmetteur: facture.adresseEmetteur,
      siretEmetteur: facture.siretEmetteur,
      tvaIntraEmetteur: facture.tvaIntraEmetteur,
      ibanEmetteur: facture.ibanEmetteur,
      client: {
        name: facture.client.name,
        address: facture.client.address,
        city: facture.client.city,
        postalCode: facture.client.postalCode,
        siret: facture.client.siret ?? null,
      },
    });
    const xmlBytes = new TextEncoder().encode(xmlString);

    // 3. Embarquer le XML dans le PDF avec pdf-lib
    const { PDFDocument } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Métadonnées PDF/A requises pour Factur-X
    pdfDoc.setTitle(`Facture ${facture.numero}`);
    pdfDoc.setCreator("ProdBill");
    pdfDoc.setProducer("ProdBill — Factur-X EN 16931");

    // Pièce jointe XML avec relation "Alternative" (spéc ZUGFeRD/Factur-X)
    await pdfDoc.attach(xmlBytes, "factur-x.xml", {
      mimeType: "application/xml",
      description: "Factur-X EN 16931 — profil MINIMUM",
      creationDate: facture.dateEmission ?? new Date(),
      modificationDate: facture.dateEmission ?? new Date(),
      afRelationship: "Alternative" as never,
    });

    const outputBytes = await pdfDoc.save();

    const filename = `facturx-${facture.numero.replace(/\//g, "-")}.pdf`;

    return new Response(Buffer.from(outputBytes), {
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
