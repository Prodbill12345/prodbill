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
import { devisRecapVisibility } from "@/lib/devis-recap-visibility";
import { formatPeriodeExploitation } from "@/lib/periode-exploitation";
import "@/lib/pdf/fonts";
import { normalizeNfcDeep } from "@/lib/pdf/nfc";
import { colors, fonts, rules, sectionLabel } from "@/design/tokens";

export type DevisForPdf = Devis & {
  client: Client;
  company: Company;
  sections: (DevisSection & { lignes: DevisLigne[] })[];
};

// ─── helpers ────────────────────────────────────────────────────────────────

function euros(n: number): string {
  // Intl.NumberFormat("fr-FR") produit U+202F (narrow no-break space) comme séparateur
  // de milliers et U+00A0 avant le symbole €. Ni Space Grotesk ni DM Sans ne
  // contiennent U+202F (cf. src/assets/fonts/README.md) → on normalise en espace ASCII.
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n).replace(/[\u202F\u00A0]/g, "\u0020");
}

function qte(n: number): string {
  // Même normalisation que euros() : les polices embarquées n'ont pas U+202F.
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
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

// DA ProdBill, déclinaison documents (C-REDESIGN-PHASE1-PDF) — tokens dans
// src/design/tokens.ts. Habillage uniquement : structure inchangée.
const s = StyleSheet.create({
  page: {
    fontFamily: fonts.text,
    fontSize: 8.5,
    paddingTop: 40,
    paddingBottom: 72,
    paddingHorizontal: 40,
    color: colors.ink,
    backgroundColor: colors.cream,
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  logo: { width: 110, marginBottom: 6 },
  companyName: { fontFamily: fonts.display, fontWeight: 700, fontSize: 15, color: colors.ink, marginBottom: 4 },
  companyMeta: { fontSize: 7.5, color: colors.inkMuted, lineHeight: 1.55 },
  headerRight: { alignItems: "flex-end" },
  docTitre: { fontFamily: fonts.display, fontWeight: 700, fontSize: 26, color: colors.ink, letterSpacing: -0.5, marginBottom: 2 },
  docNumero: { fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: colors.accent, marginBottom: 2 },
  docBrouillon: { fontSize: 9, color: colors.inkMuted, marginBottom: 2 },
  docDate: { fontSize: 7.5, color: colors.inkMuted, marginTop: 4 },

  // Parties
  partiesRow: { flexDirection: "row", marginBottom: 22 },
  partyBox: { flex: 1, borderTopWidth: rules.thin, borderTopColor: colors.rule, paddingTop: 8 },
  partyBoxLeft: { marginRight: 20 },
  partyLabel: { ...sectionLabel, color: colors.accent, marginBottom: 6 },
  partyName: { fontWeight: 700, fontSize: 9.5, color: colors.ink, marginBottom: 2 },
  partyDetail: { fontSize: 7.5, color: colors.inkMuted, lineHeight: 1.55 },

  // Objet
  objetRow: { flexDirection: "row", marginBottom: 10 },
  objetLabel: { fontWeight: 500, fontSize: 8, color: colors.inkMuted, marginRight: 6 },
  objetText: { fontWeight: 500, fontSize: 9, color: colors.ink, flex: 1 },

  // Champs d'identification projet (Projet | Réf. devis | Année)
  projectRow: { flexDirection: "row", gap: 12, marginBottom: 6 },
  projectBox: { flex: 1, borderTopWidth: rules.hairline, borderTopColor: colors.rule, paddingTop: 6 },
  projectLabel: { ...sectionLabel, fontSize: 6, color: colors.inkMuted, marginBottom: 3 },
  projectValue: { fontSize: 8.5, color: colors.ink },

  // Description
  descriptionBlock: { marginBottom: 16 },
  descriptionText: { fontSize: 8.5, color: colors.inkMuted, lineHeight: 1.6 },

  // Période d'exploitation
  periodeBlock: { marginBottom: 16 },
  periodeText: { fontSize: 8.5, color: colors.inkMuted, lineHeight: 1.6 },
  periodeLabel: { fontWeight: 700, color: colors.ink },

  // Section / table — filets horizontaux fins, pas d'aplats
  sectionBlock: { marginBottom: 14 },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 9,
    color: colors.ink,
    paddingBottom: 5,
  },
  tableHead: {
    flexDirection: "row",
    borderTopWidth: rules.thin,
    borderTopColor: colors.ink,
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 5,
  },
  thText: { fontWeight: 500, fontSize: 6, letterSpacing: 1.5, textTransform: "uppercase", color: colors.inkMuted },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 5,
  },
  indexRow: {
    flexDirection: "row",
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 4,
  },
  indexText: { color: colors.inkMuted },
  sectionSubtotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  // flex = colLib + colTag : les capitales espacées ont la place de tenir sur une ligne.
  sectionSubtotalLabel: { fontWeight: 700, fontSize: 6.5, letterSpacing: 1, color: colors.ink, flex: 4.7 },
  sectionSubtotalValue: { fontFamily: fonts.display, fontWeight: 700, fontSize: 8.5, color: colors.ink, textAlign: "right", flex: 1.1 },
  tdText: { fontSize: 8, color: colors.ink },
  tdRight: { fontFamily: fonts.display, fontWeight: 500, fontSize: 8, color: colors.ink, textAlign: "right" },
  colLib: { flex: 3.5, paddingRight: 8 },
  colTag: { flex: 1.2 },
  colQte: { flex: 0.55, textAlign: "right" },
  colPu: { flex: 1.1, textAlign: "right" },
  colTot: { flex: 1.1, textAlign: "right" },

  // Badges hors marge / hors CS — pastille discrète
  badge: {
    alignSelf: "flex-start",
    borderWidth: rules.hairline,
    borderColor: colors.inkSubtle,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    marginTop: 2,
  },
  badgeText: { fontSize: 6, color: colors.inkMuted, letterSpacing: 0.3 },

  // Totaux — bloc récapitulatif sur fond secondaire, total final en accent
  totauxSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totauxBox: { width: 240, backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 12 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totLabel: { fontSize: 7.5, color: colors.inkMuted },
  totValue: { fontFamily: fonts.display, fontWeight: 500, fontSize: 8, color: colors.ink },
  totPct: { fontFamily: fonts.display, fontWeight: 500, fontSize: 7.5, color: colors.inkMuted },
  totDivider: { borderTopWidth: rules.thin, borderTopColor: colors.rule, marginVertical: 6 },
  totHtLabel: { fontWeight: 700, fontSize: 8.5, color: colors.ink },
  totHtValue: { fontFamily: fonts.display, fontWeight: 700, fontSize: 9, color: colors.ink },
  // Libellé au-dessus, montant aligné à droite dessous : tient quelle que
  // soit la longueur du libellé (« MONTANT DE L'AVOIR TTC »).
  totFinalRow: {
    flexDirection: "column",
    borderTopWidth: rules.thin,
    borderTopColor: colors.ink,
    paddingTop: 8,
    marginTop: 8,
  },
  totFinalLabel: { ...sectionLabel, fontSize: 7, color: colors.accent, marginBottom: 2 },
  totFinalValue: { fontFamily: fonts.display, fontWeight: 700, fontSize: 17, color: colors.accent, textAlign: "right" },
  tvaMention: { fontSize: 7.5, color: colors.inkMuted },

  // Mentions légales L441-9
  mentionsBlock: {
    marginTop: 26,
    borderTopWidth: rules.thin,
    borderTopColor: colors.rule,
    paddingTop: 12,
  },
  mentionsTitle: { ...sectionLabel, fontSize: 6, color: colors.inkMuted, marginBottom: 8 },
  mentionsRow: { flexDirection: "row" },
  mentionsCol: { flex: 1 },
  mentionsColLeft: { marginRight: 20 },
  mentionItem: { marginBottom: 4 },
  mentionLabel: { fontWeight: 700, fontSize: 7, color: colors.ink },
  mentionText: { fontSize: 7, color: colors.inkMuted, lineHeight: 1.55 },
  ibanBox: {
    marginTop: 10,
    borderTopWidth: rules.hairline,
    borderTopColor: colors.rule,
    paddingTop: 8,
    flexDirection: "row",
  },
  ibanCol: { flex: 1 },
  ibanColLeft: { marginRight: 20 },
  ibanLabel: { ...sectionLabel, fontSize: 6, color: colors.inkMuted, marginBottom: 3 },
  ibanText: { fontWeight: 500, fontSize: 8, color: colors.ink },

  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: rules.hairline,
    borderTopColor: colors.rule,
    paddingTop: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 6.5, color: colors.inkSubtle },
  pageNum: { fontFamily: fonts.display, fontWeight: 500, fontSize: 6.5, color: colors.inkSubtle },
});

// ─── composant ──────────────────────────────────────────────────────────────

export function DevisPdf({ devis: devisBrut }: { devis: DevisForPdf }) {
  // Textes en NFC : accents décomposés recomposés (affichage uniquement).
  const devis = normalizeNfcDeep(devisBrut);
  const { company, client } = devis;

  // NONNA : masque TVA + TTC sur les devis (pur affichage). Cf. company flag.
  const { showTva, showTtc } = devisRecapVisibility(company);

  const titreDoc = devis.numero ? `DEVIS N° ${devis.numero}` : "DEVIS (Brouillon)";
  const periodeTexte = formatPeriodeExploitation(devis);

  const adresseCompany = [company.address, `${company.postalCode} ${company.city}`]
    .filter((s) => s.trim())
    .join(" — ");

  const adresseClient = [client.address, `${client.postalCode} ${client.city}`]
    .filter((s) => s.trim())
    .join(" — ");

  // Lignes à plat — utilisées uniquement pour recalculer les indexations
  // annuelles (non stockées sur le devis). Les CS/FG/Marge viennent des
  // champs dénormalisés du devis (snapshot à la sauvegarde/à l'import).
  const allLignes = devis.sections.flatMap((sec) =>
    sec.lignes.map((l) => ({ tag: l.tag, quantite: l.quantite, prixUnit: l.prixUnit, tauxIndexation: l.tauxIndexation }))
  );

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
            <Text style={s.docTitre}>Devis</Text>
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
            {devis.dateSeance && (
              <Text style={s.docDate}>Date de la séance : {fmtDate(devis.dateSeance)}</Text>
            )}
          </View>
        </View>

        {/* ── Emetteur / Destinataire ────────────────────────────── */}
        <View style={s.partiesRow}>
          <View style={[s.partyBox, s.partyBoxLeft]}>
            <Text style={s.partyLabel}>ÉMETTEUR</Text>
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
              <View style={s.projectRow}>
                {devis.nomProjet ? (
                  <View style={s.projectBox}>
                    <Text style={s.projectLabel}>PROJET</Text>
                    <Text style={s.projectValue}>{devis.nomProjet}</Text>
                  </View>
                ) : <View style={{ flex: 1 }} />}
                {devis.refDevis ? (
                  <View style={s.projectBox}>
                    <Text style={s.projectLabel}>RÉF. DEVIS</Text>
                    <Text style={s.projectValue}>{devis.refDevis}</Text>
                  </View>
                ) : <View style={{ flex: 1 }} />}
                {devis.annee ? (
                  <View style={s.projectBox}>
                    <Text style={s.projectLabel}>ANNÉE</Text>
                    <Text style={s.projectValue}>{devis.annee}</Text>
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

        {/* ── Période d'exploitation (ticket #69) ──────────────────
            Texte via formatPeriodeExploitation (du X au Y / à partir du X /
            jusqu'au Y, + libellé). Une date orpheline ou invalide en base
            ne produit jamais « Invalid Date ». */}
        {periodeTexte && (
          <View style={s.periodeBlock}>
            <Text style={s.periodeText}>
              <Text style={s.periodeLabel}>
                Période d&apos;exploitation :{" "}
              </Text>
              {periodeTexte}
            </Text>
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
            {section.lignes.flatMap((ligne) => {
              const rows = [
                <View key={ligne.id} style={s.tableRow}>
                  <View style={[s.colLib, { flexDirection: "column" }]}>
                    <Text style={s.tdText}>{ligne.libelle}</Text>
                    {ligne.horsMarge && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>hors marge &amp; FG</Text>
                      </View>
                    )}
                    {ligne.horsCS && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>hors charges sociales</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.tdText, s.colTag]}>{TAG_LABELS[ligne.tag] ?? ligne.tag}</Text>
                  <Text style={[s.tdRight, s.colQte]}>{qte(ligne.quantite)}</Text>
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
                  <View key={`${ligne.id}-idx`} style={s.indexRow}>
                    <Text style={[s.tdText, s.colLib, s.indexText, { paddingLeft: 10 }]}>{label}</Text>
                    <Text style={[s.tdText, s.colTag, s.indexText]}>{ligne.tauxIndexation}%</Text>
                    <Text style={[s.tdRight, s.colQte]} />
                    <Text style={[s.tdRight, s.colPu]} />
                    <Text style={[s.tdRight, s.colTot, s.indexText]}>{euros(montant)}</Text>
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

        {/* ── Totaux (valeurs stockées sur le devis) ────────────── */}
        {(() => {
          // Indexations recalculées depuis les lignes (non stockées sur devis).
          const indexArtiste = Math.round(
            allLignes
              .filter((l) => l.tag === "ARTISTE")
              .reduce((s, l) => s + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0) * 100
          ) / 100;
          const indexMusique = Math.round(
            allLignes
              .filter((l) => l.tag === "MUSIQUE")
              .reduce((s, l) => s + l.quantite * l.prixUnit * ((l.tauxIndexation ?? 0) / 100), 0) * 100
          ) / 100;
          // 4 lignes CS/FG/Marge — masquées si à 0 €.
          const detailRows = [
            { label: "Charges sociales / comédien",    taux: devis.tauxCsComedien, montant: devis.csComedien },
            { label: "Charges sociales / techniciens", taux: devis.tauxCsTech,     montant: devis.csTechniciens },
            { label: "Frais généraux",                 taux: devis.tauxFg,         montant: devis.fraisGeneraux },
            { label: "Marge de fonctionnement",        taux: devis.tauxMarge,      montant: devis.marge },
          ].filter((r) => r.montant !== 0);

          return (
            <View style={s.totauxSection}>
              <View style={s.totauxBox}>
                <View style={s.totRow}>
                  <Text style={s.totLabel}>SOUS TOTAL HT</Text>
                  <Text style={s.totValue}>{euros(devis.sousTotal)}</Text>
                </View>

                {detailRows.length > 0 && <View style={{ height: 4 }} />}

                {detailRows.map((r) => (
                  <View key={r.label} style={s.totRow}>
                    <Text style={[s.totLabel, { flex: 1 }]}>{r.label}</Text>
                    <Text style={[s.totPct, { width: 40, textAlign: "right" }]}>{pct(r.taux)}</Text>
                    <Text style={[s.totValue, { width: 65, textAlign: "right" }]}>{euros(r.montant)}</Text>
                  </View>
                ))}

                {indexArtiste > 0 && (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>Indexation annuelle artiste</Text>
                    <Text style={s.totValue}>{euros(indexArtiste)}</Text>
                  </View>
                )}
                {indexMusique > 0 && (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>Indexation annuelle musique</Text>
                    <Text style={s.totValue}>{euros(indexMusique)}</Text>
                  </View>
                )}

                {devis.coproduction !== 0 && (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>Co-production</Text>
                    <Text style={s.totValue}>{euros(-devis.coproduction)}</Text>
                  </View>
                )}
                {devis.remise !== 0 && (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>Remise exceptionnelle</Text>
                    <Text style={s.totValue}>{euros(-devis.remise)}</Text>
                  </View>
                )}

                {/* Sans TTC, le filet du total final suffit (pas de double trait). */}
                {showTtc && <View style={s.totDivider} />}

                {/* TOTAL HT = HT net après remise et co-production (base TVA).
                    totalApresRemise est calculé par calculerDevis() et
                    correspond à totalHt - remise - coproduction. Sur les devis
                    sans remise ni coproduction, totalApresRemise === totalHt. */}
                {/* Sans TTC (NONNA), le TOTAL HT est le total final du
                    document : il prend la mise en valeur du TTC. */}
                <View style={showTtc ? s.totRow : s.totFinalRow}>
                  <Text style={showTtc ? s.totHtLabel : s.totFinalLabel}>TOTAL HT</Text>
                  <Text style={showTtc ? s.totHtValue : s.totFinalValue}>{euros(devis.totalApresRemise)}</Text>
                </View>
                {showTva && (devis.tauxTva === 0 ? (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>TVA non applicable</Text>
                    <Text style={s.totValue}>—</Text>
                  </View>
                ) : (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>TVA {devis.tauxTva % 1 === 0 ? devis.tauxTva.toFixed(0) : String(devis.tauxTva).replace(".", ",")} %</Text>
                    <Text style={s.totValue}>{euros(devis.tva)}</Text>
                  </View>
                ))}

                {showTtc && (
                  <View style={s.totFinalRow}>
                    <Text style={s.totFinalLabel}>TOTAL TTC</Text>
                    <Text style={s.totFinalValue}>{euros(devis.totalTtc)}</Text>
                  </View>
                )}

                {/* Mention légale TVA — visible uniquement si TVA=0 et TVA affichée */}
                {showTva && devis.tauxTva === 0 && (
                  <View style={[s.totRow, { marginTop: 4 }]}>
                    <Text style={s.tvaMention}>
                      {devis.tvaMention || "Art. 293 B du CGI"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* ── Mentions légales art. L441-9 C. com. ─────────────── */}
        <View style={s.mentionsBlock} wrap={false}>
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
