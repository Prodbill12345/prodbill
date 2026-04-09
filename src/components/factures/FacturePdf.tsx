import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Facture, Client } from "@prisma/client";

export type FactureForPdf = Facture & {
  client: Client;
  devis?: { numero: string; objet: string } | null;
  logoUrl?: string | null; // logo courant de la société (passé depuis le PDF route)
};

// ─── helpers ────────────────────────────────────────────────────────────────

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u202F\u00A0]/g, "\u0020");
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
}

// ─── styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 72,
    paddingHorizontal: 40,
    color: "#1e293b",
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  logo: { width: 110, marginBottom: 6 },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 15, color: "#1e293b", marginBottom: 4 },
  companyMeta: { fontSize: 7.5, color: "#64748b", lineHeight: 1.55 },
  headerRight: { alignItems: "flex-end" },
  docTitre: { fontFamily: "Helvetica-Bold", fontSize: 22, color: "#1e293b", marginBottom: 3 },
  docNumero: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#3b82f6", marginBottom: 2 },
  docAvoir: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#dc2626", marginBottom: 2 },
  docDate: { fontSize: 8, color: "#64748b", marginTop: 4 },

  // Parties
  partiesRow: { flexDirection: "row", marginBottom: 20 },
  partyBox: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 10 },
  partyBoxLeft: { marginRight: 10 },
  partyLabel: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#94a3b8", marginBottom: 5 },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: "#1e293b", marginBottom: 2 },
  partyDetail: { fontSize: 8, color: "#475569", lineHeight: 1.55 },

  // Objet / référence devis
  refRow: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 4,
    padding: 10,
    marginBottom: 18,
  },
  refLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#3b82f6", marginRight: 6 },
  refText: { fontSize: 8.5, color: "#1e293b", flex: 1 },

  // Tableau montants
  amountsBlock: { marginBottom: 20 },
  amountsTable: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, overflow: "hidden" },
  amountsHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  amountsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#64748b" },
  tdText: { fontSize: 8.5, color: "#334155" },
  tdRight: { fontSize: 8.5, color: "#334155", textAlign: "right" },
  colDesc: { flex: 4 },
  colQte: { flex: 0.6, textAlign: "right" },
  colPu: { flex: 1.2, textAlign: "right" },
  colTot: { flex: 1.2, textAlign: "right" },

  // Totaux
  totauxSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totauxBox: { width: 228 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totLabel: { fontSize: 8, color: "#64748b" },
  totValue: { fontSize: 8, color: "#334155" },
  totDivider: { borderTopWidth: 1, borderTopColor: "#cbd5e1", marginVertical: 5 },
  totHtLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1e293b" },
  totHtValue: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1e293b" },
  totTtcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 6,
  },
  totTtcRowAvoir: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#dc2626",
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 6,
  },
  totTtcLabel: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: "#ffffff" },
  totTtcValue: { fontFamily: "Helvetica-Bold", fontSize: 10.5, color: "#ffffff" },

  // Mentions légales L441-9
  mentionsBlock: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 12,
  },
  mentionsTitle: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#94a3b8", marginBottom: 7 },
  mentionsRow: { flexDirection: "row" },
  mentionsCol: { flex: 1 },
  mentionsColLeft: { marginRight: 20 },
  mentionItem: { marginBottom: 4 },
  mentionLabel: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#475569" },
  mentionText: { fontSize: 7.5, color: "#64748b", lineHeight: 1.55 },
  ibanBox: {
    marginTop: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 8,
    flexDirection: "row",
  },
  ibanCol: { flex: 1 },
  ibanColLeft: { marginRight: 20 },
  ibanLabel: { fontFamily: "Helvetica-Bold", fontSize: 7, color: "#94a3b8", marginBottom: 3 },
  ibanText: { fontSize: 8, color: "#334155" },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: "#94a3b8" },
  pageNum: { fontSize: 6.5, color: "#94a3b8" },
});

// ─── composant ──────────────────────────────────────────────────────────────

export function FacturePdf({ facture }: { facture: FactureForPdf }) {
  const { client, logoUrl } = facture;
  const isAvoir = facture.type === "AVOIR";

  const docTitreLabel = isAvoir ? "AVOIR" : "FACTURE";
  const titreDoc = `${docTitreLabel} N° ${facture.numero}`;

  const adresseClient = [
    client.address,
    [client.postalCode, client.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" — ");

  // Description de la ligne selon le type
  let ligneDescription = "";
  let ligneRef = "";
  if (facture.devis) {
    if (facture.type === "ACOMPTE") {
      ligneDescription = `Acompte sur devis n° ${facture.devis.numero}`;
      ligneRef = facture.devis.objet;
    } else if (facture.type === "SOLDE") {
      ligneDescription = `Solde sur devis n° ${facture.devis.numero}`;
      ligneRef = facture.devis.objet;
    } else {
      ligneDescription = `Avoir sur facture n° ${facture.numero}`;
      ligneRef = facture.devis.objet;
    }
  } else {
    ligneDescription = isAvoir ? "Avoir" : "Prestation";
  }

  const absHt = Math.abs(facture.totalHt);
  const absTva = Math.abs(facture.tva);
  const absTtc = Math.abs(facture.totalTtc);

  return (
    <Document
      title={titreDoc}
      author={facture.nomEmetteur}
      subject={ligneRef || ligneDescription}
      creator="ProdBill"
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            {logoUrl
              ? <Image src={logoUrl} style={s.logo} />
              : <Text style={s.companyName}>{facture.nomEmetteur}</Text>
            }
            <Text style={s.companyMeta}>{facture.adresseEmetteur}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitre}>{docTitreLabel}</Text>
            <Text style={isAvoir ? s.docAvoir : s.docNumero}>
              N° {facture.numero}
            </Text>
            {facture.dateEmission && (
              <Text style={s.docDate}>
                Émise le {fmtDate(facture.dateEmission)}
              </Text>
            )}
            {!isAvoir && facture.dateEcheance && (
              <Text style={s.docDate}>
                Échéance : {fmtDate(facture.dateEcheance)}
              </Text>
            )}
          </View>
        </View>

        {/* ── Emetteur / Destinataire ────────────────────────────── */}
        <View style={s.partiesRow}>
          <View style={[s.partyBox, s.partyBoxLeft]}>
            <Text style={s.partyLabel}>ÉMETTEUR</Text>
            <Text style={s.partyName}>{facture.nomEmetteur}</Text>
            <Text style={s.partyDetail}>{facture.adresseEmetteur}</Text>
            <Text style={s.partyDetail}>SIRET : {facture.siretEmetteur}</Text>
            <Text style={s.partyDetail}>TVA : {facture.tvaIntraEmetteur}</Text>
          </View>
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>DESTINATAIRE</Text>
            <Text style={s.partyName}>{client.name}</Text>
            <Text style={s.partyDetail}>{adresseClient}</Text>
            {client.siret && (
              <Text style={s.partyDetail}>SIRET : {client.siret}</Text>
            )}
            {client.tvaIntra && (
              <Text style={s.partyDetail}>TVA : {client.tvaIntra}</Text>
            )}
            <Text style={s.partyDetail}>{client.email}</Text>
          </View>
        </View>

        {/* ── Référence devis ───────────────────────────────────── */}
        {facture.devis && (
          <View style={s.refRow}>
            <Text style={s.refLabel}>Réf. :</Text>
            <Text style={s.refText}>
              {ligneDescription}
              {ligneRef ? ` — ${ligneRef}` : ""}
            </Text>
          </View>
        )}

        {/* ── Tableau de facturation ────────────────────────────── */}
        <View style={s.amountsBlock}>
          <View style={s.amountsTable}>
            <View style={s.amountsHead}>
              <Text style={[s.thText, s.colDesc]}>Description</Text>
              <Text style={[s.thText, s.colQte]}>Qté</Text>
              <Text style={[s.thText, s.colPu]}>P.U. HT</Text>
              <Text style={[s.thText, s.colTot]}>Total HT</Text>
            </View>
            <View style={s.amountsRow}>
              <Text style={[s.tdText, s.colDesc]}>{ligneDescription}</Text>
              <Text style={[s.tdRight, s.colQte]}>1</Text>
              <Text style={[s.tdRight, s.colPu]}>
                {isAvoir ? `- ${euros(absHt)}` : euros(absHt)}
              </Text>
              <Text style={[s.tdRight, s.colTot]}>
                {isAvoir ? `- ${euros(absHt)}` : euros(absHt)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Totaux ────────────────────────────────────────────── */}
        <View style={s.totauxSection}>
          <View style={s.totauxBox}>
            <View style={s.totRow}>
              <Text style={s.totHtLabel}>TOTAL HT</Text>
              <Text style={s.totHtValue}>
                {isAvoir ? `- ${euros(absHt)}` : euros(absHt)}
              </Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>TVA 20%</Text>
              <Text style={s.totValue}>
                {isAvoir ? `- ${euros(absTva)}` : euros(absTva)}
              </Text>
            </View>
            <View style={isAvoir ? s.totTtcRowAvoir : s.totTtcRow}>
              <Text style={s.totTtcLabel}>
                {isAvoir ? "MONTANT DE L'AVOIR TTC" : "TOTAL TTC"}
              </Text>
              <Text style={s.totTtcValue}>
                {isAvoir ? `- ${euros(absTtc)}` : euros(absTtc)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Mentions légales art. L441-9 C. com. ─────────────── */}
        {!isAvoir && (
          <View style={s.mentionsBlock}>
            <Text style={s.mentionsTitle}>
              MENTIONS LÉGALES — art. L441-9 Code de commerce
            </Text>

            <View style={s.mentionsRow}>
              <View style={[s.mentionsCol, s.mentionsColLeft]}>
                <View style={s.mentionItem}>
                  <Text style={s.mentionLabel}>Conditions de paiement</Text>
                  <Text style={s.mentionText}>{facture.conditionsPaiement}</Text>
                </View>
                <View style={s.mentionItem}>
                  <Text style={s.mentionLabel}>Pénalités de retard</Text>
                  <Text style={s.mentionText}>
                    15% par an, exigibles à 45 jours date de facture.
                  </Text>
                </View>
              </View>
              <View style={s.mentionsCol}>
                <View style={s.mentionItem}>
                  <Text style={s.mentionLabel}>
                    Indemnité forfaitaire de recouvrement
                  </Text>
                  <Text style={s.mentionText}>40 € (art. D. 441-5 C. com.)</Text>
                </View>
              </View>
            </View>

            {/* Coordonnées bancaires */}
            <View style={s.ibanBox}>
              {facture.nomBanqueEmetteur ? (
                <View style={[s.ibanCol, s.ibanColLeft]}>
                  <Text style={s.ibanLabel}>BANQUE</Text>
                  <Text style={s.ibanText}>{facture.nomBanqueEmetteur}</Text>
                </View>
              ) : null}
              <View style={[s.ibanCol, s.ibanColLeft]}>
                <Text style={s.ibanLabel}>IBAN</Text>
                <Text style={s.ibanText}>{facture.ibanEmetteur}</Text>
              </View>
              <View style={s.ibanCol}>
                <Text style={s.ibanLabel}>BIC / SWIFT</Text>
                <Text style={s.ibanText}>{facture.bicEmetteur}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Footer fixe ───────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {facture.nomEmetteur} — SIRET {facture.siretEmetteur} — TVA{" "}
            {facture.tvaIntraEmetteur}
          </Text>
          <Text
            style={s.pageNum}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
