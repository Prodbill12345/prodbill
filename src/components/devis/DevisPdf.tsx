import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  Devis,
  DevisSection,
  DevisLigne,
  Client,
  Company,
} from "@prisma/client";
import { calculerDevis } from "@/lib/calculations";

export type DevisForPdf = Devis & {
  client: Client;
  company: Company;
  sections: (DevisSection & { lignes: DevisLigne[] })[];
};

// ─── helpers ────────────────────────────────────────────────────────────────

function euros(n: number): string {
  // Intl.NumberFormat("fr-FR") produit U+202F (narrow no-break space) comme séparateur
  // de milliers et U+00A0 avant le symbole €. La police Helvetica embarquée dans
  // react-pdf ne contient pas U+202F → rendu en "/". On normalise en espace ASCII.
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u202F\u00A0]/g, "\u0020");
}

function pct(r: number): string {
  return `${Math.round(r * 10000) / 100}%`;
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
}

const TAG_LABELS: Record<string, string> = {
  ARTISTE: "Artistes",
  TECHNICIEN_HCS: "Tech. HCS",
  STUDIO: "Studio",
  MUSIQUE: "Musique",
  AGENT: "Agent (10%)",
};

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
  docBrouillon: { fontSize: 9, color: "#94a3b8", marginBottom: 2 },
  docDate: { fontSize: 8, color: "#64748b", marginTop: 4 },

  // Parties
  partiesRow: { flexDirection: "row", marginBottom: 20 },
  partyBox: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 10 },
  partyBoxLeft: { marginRight: 10 },
  partyLabel: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#94a3b8", marginBottom: 5 },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: "#1e293b", marginBottom: 2 },
  partyDetail: { fontSize: 8, color: "#475569", lineHeight: 1.55 },

  // Objet
  objetRow: { flexDirection: "row", marginBottom: 10 },
  objetLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#64748b", marginRight: 6 },
  objetText: { fontSize: 9, color: "#1e293b", flex: 1 },

  // Description
  descriptionBlock: { marginBottom: 16 },
  descriptionText: { fontSize: 8.5, color: "#64748b", lineHeight: 1.6, fontStyle: "italic" },

  // Section / table
  sectionBlock: { marginBottom: 8 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    backgroundColor: "#f1f5f9",
    color: "#334155",
    padding: 6,
    marginBottom: 0,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#64748b" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRowAlt: { backgroundColor: "#fafafa" },
  sectionSubtotalRow: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
  },
  sectionSubtotalLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155", flex: 1 },
  sectionSubtotalValue: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#1e293b", textAlign: "right", flex: 1.1 },
  tdText: { fontSize: 8, color: "#334155" },
  tdRight: { fontSize: 8, color: "#334155", textAlign: "right" },
  colLib: { flex: 3.5 },
  colTag: { flex: 1.2 },
  colQte: { flex: 0.55, textAlign: "right" },
  colPu: { flex: 1.1, textAlign: "right" },
  colTot: { flex: 1.1, textAlign: "right" },

  // Totaux
  totauxSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
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

export function DevisPdf({ devis }: { devis: DevisForPdf }) {
  const { company, client } = devis;

  const titreDoc = devis.numero ? `DEVIS N° ${devis.numero}` : "DEVIS (Brouillon)";

  const adresseCompany = [company.address, `${company.postalCode} ${company.city}`]
    .filter((s) => s.trim())
    .join(" — ");

  const adresseClient = [client.address, `${client.postalCode} ${client.city}`]
    .filter((s) => s.trim())
    .join(" — ");

  // Recalcul depuis les lignes — plus fiable que les valeurs dénormalisées en DB
  // (elles peuvent être à 0 si le devis a été créé avec une ancienne version du code)
  const allLignes = devis.sections.flatMap((sec) =>
    sec.lignes.map((l) => ({ tag: l.tag, quantite: l.quantite, prixUnit: l.prixUnit, tauxIndexation: l.tauxIndexation }))
  );
  const taux = {
    tauxCsComedien: devis.tauxCsComedien,
    tauxCsTech: devis.tauxCsTech,
    tauxFg: devis.tauxFg,
    tauxMarge: devis.tauxMarge,
  };
  const totaux = calculerDevis(allLignes, taux);

  return (
    <Document
      title={titreDoc}
      author={company.name}
      subject={devis.objet}
      creator="ProdBill"
    >
      <Page size="A4" style={s.page}>
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            {company.logoUrl
              ? <Image src={company.logoUrl} style={s.logo} />
              : <Text style={s.companyName}>{company.name}</Text>
            }
            <Text style={s.companyMeta}>{adresseCompany}</Text>
            {company.email && <Text style={s.companyMeta}>{company.email}</Text>}
            {company.phone && <Text style={s.companyMeta}>{company.phone}</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitre}>DEVIS</Text>
            {devis.numero
              ? <Text style={s.docNumero}>N° {devis.numero}</Text>
              : <Text style={s.docBrouillon}>Brouillon</Text>
            }
            <Text style={s.docDate}>
              Émis le {fmtDate(devis.dateEmission ?? devis.createdAt)}
            </Text>
            {devis.dateValidite && (
              <Text style={s.docDate}>Valide jusqu&apos;au {fmtDate(devis.dateValidite)}</Text>
            )}
          </View>
        </View>

        {/* ── Emetteur / Destinataire ────────────────────────────── */}
        <View style={s.partiesRow}>
          <View style={[s.partyBox, s.partyBoxLeft]}>
            <Text style={s.partyLabel}>EMETTEUR</Text>
            <Text style={s.partyName}>{company.name}</Text>
            <Text style={s.partyDetail}>{adresseCompany}</Text>
            <Text style={s.partyDetail}>SIRET : {company.siret}</Text>
            <Text style={s.partyDetail}>TVA : {company.tvaIntra}</Text>
          </View>
          <View style={s.partyBox}>
            <Text style={s.partyLabel}>DESTINATAIRE</Text>
            <Text style={s.partyName}>{client.name}</Text>
            <Text style={s.partyDetail}>{adresseClient}</Text>
            {client.siret && <Text style={s.partyDetail}>SIRET : {client.siret}</Text>}
            {client.tvaIntra && <Text style={s.partyDetail}>TVA : {client.tvaIntra}</Text>}
            <Text style={s.partyDetail}>{client.email}</Text>
          </View>
        </View>

        {/* ── Objet ─────────────────────────────────────────────── */}
        <View style={s.objetRow}>
          <Text style={s.objetLabel}>Objet :</Text>
          <Text style={s.objetText}>{devis.objet}</Text>
        </View>

        {/* ── Champs d'identification projet ────────────────────── */}
        {(devis.nomProjet || devis.refDevis || devis.annee) && (
          <View style={{ marginBottom: 14 }}>
            {/* Ligne 1 : Projet | Réf. devis | Année */}
            {(devis.nomProjet || devis.refDevis || devis.annee) && (
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                {devis.nomProjet ? (
                  <View style={{ flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 8 }}>
                    <Text style={s.partyLabel}>PROJET</Text>
                    <Text style={{ fontSize: 8.5, color: "#1e293b" }}>{devis.nomProjet}</Text>
                  </View>
                ) : <View style={{ flex: 1 }} />}
                {devis.refDevis ? (
                  <View style={{ flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 8 }}>
                    <Text style={s.partyLabel}>RÉF. DEVIS</Text>
                    <Text style={{ fontSize: 8.5, color: "#1e293b" }}>{devis.refDevis}</Text>
                  </View>
                ) : <View style={{ flex: 1 }} />}
                {devis.annee ? (
                  <View style={{ flex: 1, backgroundColor: "#f8fafc", borderRadius: 4, padding: 8 }}>
                    <Text style={s.partyLabel}>ANNÉE</Text>
                    <Text style={{ fontSize: 8.5, color: "#1e293b" }}>{devis.annee}</Text>
                  </View>
                ) : <View style={{ flex: 1 }} />}
              </View>
            )}
          </View>
        )}

        {/* ── Description ───────────────────────────────────────── */}
        {devis.description && (
          <View style={s.descriptionBlock}>
            <Text style={s.descriptionText}>{devis.description}</Text>
          </View>
        )}

        {/* ── Sections / lignes ─────────────────────────────────── */}
        {devis.sections.map((section) => (
          <View key={section.id} style={s.sectionBlock} wrap={false}>
            <Text style={s.sectionTitle}>{section.titre}</Text>
            {/* En-tête tableau */}
            <View style={s.tableHead}>
              <Text style={[s.thText, s.colLib]}>Libellé</Text>
              <Text style={[s.thText, s.colTag]}>Catégorie</Text>
              <Text style={[s.thText, s.colQte]}>Qté</Text>
              <Text style={[s.thText, s.colPu]}>P.U. HT</Text>
              <Text style={[s.thText, s.colTot]}>Total HT</Text>
            </View>
            {section.lignes.flatMap((ligne, i) => {
              const rows = [
                <View key={ligne.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <View style={[s.colLib, { flexDirection: "column" }]}>
                    <Text style={s.tdText}>{ligne.libelle}</Text>
                  </View>
                  <Text style={[s.tdText, s.colTag]}>{TAG_LABELS[ligne.tag] ?? ligne.tag}</Text>
                  <Text style={[s.tdRight, s.colQte]}>{ligne.quantite}</Text>
                  <Text style={[s.tdRight, s.colPu]}>{euros(ligne.prixUnit)}</Text>
                  <Text style={[s.tdRight, s.colTot]}>{euros(ligne.total)}</Text>
                </View>,
              ];
              if ((ligne.tauxIndexation ?? 0) > 0 && (ligne.tag === "ARTISTE" || ligne.tag === "MUSIQUE")) {
                const label = ligne.tag === "ARTISTE"
                  ? "Indexation annuelle artiste"
                  : "Indexation annuelle musique";
                const montant = Math.round(ligne.total * (ligne.tauxIndexation ?? 0) / 100 * 100) / 100;
                rows.push(
                  <View key={`${ligne.id}-idx`} style={[s.tableRow, { backgroundColor: "#f5f3ff" }]}>
                    <Text style={[s.tdText, s.colLib, { color: "#7c3aed", paddingLeft: 10 }]}>{label}</Text>
                    <Text style={[s.tdText, s.colTag, { color: "#7c3aed" }]}>{ligne.tauxIndexation}%</Text>
                    <Text style={[s.tdRight, s.colQte]} />
                    <Text style={[s.tdRight, s.colPu]} />
                    <Text style={[s.tdRight, s.colTot, { color: "#7c3aed" }]}>{euros(montant)}</Text>
                  </View>
                );
              }
              return rows;
            })}
            {/* Sous-total de section */}
            {(() => {
              const sectionSubtotal = Math.round(
                section.lignes.reduce((sum, l) => {
                  const base = l.total;
                  const idx = (l.tag === "ARTISTE" || l.tag === "MUSIQUE")
                    ? Math.round(base * (l.tauxIndexation ?? 0) / 100 * 100) / 100
                    : 0;
                  return sum + base + idx;
                }, 0) * 100
              ) / 100;
              const label = `SOUS TOTAL ${(section.titre || "SECTION").toUpperCase()}`;
              return (
                <View style={s.sectionSubtotalRow}>
                  <Text style={s.sectionSubtotalLabel}>{label}</Text>
                  <Text style={[s.tdRight, s.colQte]} />
                  <Text style={[s.tdRight, s.colPu]} />
                  <Text style={s.sectionSubtotalValue}>{euros(sectionSubtotal)}</Text>
                </View>
              );
            })()}
          </View>
        ))}

        {/* ── Totaux (recalculés depuis les lignes) ─────────────── */}
        <View style={s.totauxSection}>
          <View style={s.totauxBox}>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Sous-total HT</Text>
              <Text style={s.totValue}>{euros(totaux.sousTotal)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>
                CS Comédiens ({pct(devis.tauxCsComedien)})
              </Text>
              <Text style={s.totValue}>{euros(totaux.csComedien)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>
                CS Techniciens ({pct(devis.tauxCsTech)})
              </Text>
              <Text style={s.totValue}>{euros(totaux.csTechniciens)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>
                Frais généraux ({pct(devis.tauxFg)})
              </Text>
              <Text style={s.totValue}>{euros(totaux.fraisGeneraux)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>Marge ({pct(devis.tauxMarge)})</Text>
              <Text style={s.totValue}>{euros(totaux.marge)}</Text>
            </View>
            {totaux.indexationsArtiste > 0 && (
              <View style={s.totRow}>
                <Text style={[s.totLabel, { color: "#7c3aed" }]}>Indexation annuelle artiste</Text>
                <Text style={[s.totValue, { color: "#7c3aed" }]}>{euros(totaux.indexationsArtiste)}</Text>
              </View>
            )}
            {totaux.indexationsMusique > 0 && (
              <View style={s.totRow}>
                <Text style={[s.totLabel, { color: "#7c3aed" }]}>Indexation annuelle musique</Text>
                <Text style={[s.totValue, { color: "#7c3aed" }]}>{euros(totaux.indexationsMusique)}</Text>
              </View>
            )}

            <View style={s.totDivider} />

            <View style={s.totRow}>
              <Text style={s.totHtLabel}>TOTAL HT</Text>
              <Text style={s.totHtValue}>{euros(totaux.totalHt)}</Text>
            </View>
            <View style={s.totRow}>
              <Text style={s.totLabel}>TVA 20%</Text>
              <Text style={s.totValue}>{euros(totaux.tva)}</Text>
            </View>

            <View style={s.totTtcRow}>
              <Text style={s.totTtcLabel}>TOTAL TTC</Text>
              <Text style={s.totTtcValue}>{euros(totaux.totalTtc)}</Text>
            </View>
          </View>
        </View>

        {/* ── Mentions légales art. L441-9 C. com. ─────────────── */}
        <View style={s.mentionsBlock}>
          <Text style={s.mentionsTitle}>
            MENTIONS LÉGALES — art. L441-9 Code de commerce
          </Text>

          <View style={s.mentionsRow}>
            <View style={[s.mentionsCol, s.mentionsColLeft]}>
              <View style={s.mentionItem}>
                <Text style={s.mentionLabel}>Conditions de paiement</Text>
                <Text style={s.mentionText}>{company.conditionsPaiement}</Text>
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
                <Text style={s.mentionText}>
                  40 € (art. D. 441-6 C. com.)
                </Text>
              </View>
            </View>
          </View>

          {/* Coordonnées bancaires */}
          <View style={s.ibanBox}>
            {company.nomBanque ? (
              <View style={[s.ibanCol, s.ibanColLeft]}>
                <Text style={s.ibanLabel}>BANQUE</Text>
                <Text style={s.ibanText}>{company.nomBanque}</Text>
              </View>
            ) : null}
            <View style={[s.ibanCol, s.ibanColLeft]}>
              <Text style={s.ibanLabel}>IBAN</Text>
              <Text style={s.ibanText}>{company.iban}</Text>
            </View>
            <View style={s.ibanCol}>
              <Text style={s.ibanLabel}>BIC / SWIFT</Text>
              <Text style={s.ibanText}>{company.bic}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ─────────────────────────────────────────────── */}
        {devis.notes && (
          <View style={{ marginTop: 12 }}>
            <Text style={s.mentionLabel}>Notes</Text>
            <Text style={[s.mentionText, { marginTop: 3 }]}>{devis.notes}</Text>
          </View>
        )}

        {/* ── Footer fixe ───────────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {company.name} — SIRET {company.siret} — TVA {company.tvaIntra}
          </Text>
          <Text
            style={s.pageNum}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
