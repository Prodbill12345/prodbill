import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Facture, Client, LigneTag } from "@prisma/client";

import { formatFactureNumero } from "@/lib/facture-numero";
import { facturxMention } from "@/lib/facturx-tax";
import { formatPeriodeExploitation } from "@/lib/periode-exploitation";
import { factureObjetDisplay } from "@/lib/facture-objet";
import "@/lib/pdf/fonts";
import { normalizeNfcDeep } from "@/lib/pdf/nfc";
import { colors, fonts, rules, sectionLabel } from "@/design/tokens";
import type { PdfAccentKey } from "@/design/tokens";
import { pdfAccentColors } from "@/lib/pdf-accent";

export type FactureForPdf = Facture & {
  client: Client;
  devis?: {
    numero: string;
    objet: string;
    totalHt: number;
    sections: Array<{
      id: string;
      titre: string;
      ordre: number;
      lignes: Array<{
        id: string;
        libelle: string;
        tag: LigneTag;
        quantite: number;
        prixUnit: number;
        total: number;
        tauxIndexation: number;
        // Optionnel : si le devis source a été supprimé ou si le champ
        // n'a pas été selectionné par la route API, on retombe sur false.
        horsMarge?: boolean;
        horsCS?: boolean;
      }>;
    }>;
  } | null;
  // #99 : facture récapitulative multi-devis. Renseigné (≥ 2 entrées) UNIQUEMENT
  // pour une facture récap ; null/absent pour une facture mono classique (qui
  // continue d'utiliser `devis` ci-dessus). Une ligne par devis source.
  devisList?: Array<{
    id: string;
    numero: string; // stocké nu ("26005") — préfixe "D" ajouté à l'affichage
    objet: string;
    montantHt: number; // HT NET facturé pour ce devis (totalHt - remise)
  }> | null;
  logoUrl?: string | null; // logo courant de la société (passé depuis le PDF route)
};

const TAG_LABELS: Record<LigneTag, string> = {
  ARTISTE: "Artiste",
  TECHNICIEN_HCS: "Technicien",
  STUDIO: "Studio",
  MUSIQUE: "Musique",
  AGENT: "Agent",
};

// ─── helpers ────────────────────────────────────────────────────────────────

function euros(n: number): string {
  // Ni Space Grotesk ni DM Sans ne contiennent U+202F (séparateur de milliers
  // fr-FR) → normalisation en espace ASCII (cf. src/assets/fonts/README.md).
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

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(d));
}

function pct(r: number): string {
  return `${Math.round(r * 10000) / 100} %`;
}

// ─── styles ─────────────────────────────────────────────────────────────────

// DA ProdBill, déclinaison documents (C-REDESIGN-PHASE1-PDF) — tokens dans
// src/design/tokens.ts. Habillage uniquement : structure inchangée. Même
// gabarit pour facture, avoir et conteneur Factur-X.
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
  docDate: { fontSize: 7.5, color: colors.inkMuted, marginTop: 4 },

  // Parties
  partiesRow: { flexDirection: "row", marginBottom: 22 },
  partyBox: { flex: 1, borderTopWidth: rules.thin, borderTopColor: colors.rule, paddingTop: 8 },
  partyBoxLeft: { marginRight: 20 },
  partyLabel: { ...sectionLabel, color: colors.accentInk, marginBottom: 6 },
  partyName: { fontWeight: 700, fontSize: 9.5, color: colors.ink, marginBottom: 2 },
  partyDetail: { fontSize: 7.5, color: colors.inkMuted, lineHeight: 1.55 },

  // Référence devis / bandeau récap
  refRow: {
    flexDirection: "row",
    borderTopWidth: rules.hairline,
    borderTopColor: colors.rule,
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 7,
    marginBottom: 16,
  },
  refLabel: { fontWeight: 500, fontSize: 8, color: colors.inkMuted, marginRight: 6 },
  refText: { fontWeight: 500, fontSize: 8.5, color: colors.ink, flex: 1 },

  // Objet + description du projet (FEAT-FACTURE-OBJET-DESCRIPTION) —
  // mêmes styles que DevisPdf.
  objetRow: { flexDirection: "row", marginBottom: 10 },
  objetLabel: { fontWeight: 500, fontSize: 8, color: colors.inkMuted, marginRight: 6 },
  objetText: { fontWeight: 500, fontSize: 9, color: colors.ink, flex: 1 },
  descriptionBlock: { marginBottom: 16 },
  descriptionText: { fontSize: 8.5, color: colors.inkMuted, lineHeight: 1.6 },

  // N° BDC
  bdcBlock: { marginBottom: 14 },
  bdcBox: { borderTopWidth: rules.hairline, borderTopColor: colors.rule, paddingTop: 6, alignSelf: "flex-start", minWidth: 160 },
  bdcLabel: { ...sectionLabel, fontSize: 6, color: colors.inkMuted, marginBottom: 3 },
  bdcValue: { fontSize: 8.5, color: colors.ink },

  // Période d'exploitation
  periodeBlock: { marginBottom: 14 },
  periodeText: { fontSize: 8.5, color: colors.inkMuted, lineHeight: 1.6 },
  periodeLabel: { fontWeight: 700, color: colors.ink },

  // Tableau montants (récap / ligne unique) — filets horizontaux, pas d'aplats
  amountsBlock: { marginBottom: 20 },
  amountsTable: {},
  amountsHead: {
    flexDirection: "row",
    borderTopWidth: rules.thin,
    borderTopColor: colors.ink,
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 5,
  },
  amountsRow: {
    flexDirection: "row",
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 6,
  },
  thText: { fontWeight: 500, fontSize: 6, letterSpacing: 1.5, textTransform: "uppercase", color: colors.inkMuted },
  tdText: { fontSize: 8.5, color: colors.ink },
  tdRight: { fontFamily: fonts.display, fontWeight: 500, fontSize: 8.5, color: colors.ink, textAlign: "right" },
  colDesc: { flex: 4, paddingRight: 8 },
  colLib: { flex: 3.2, paddingRight: 8 },
  colTag: { flex: 1.1 },
  colQte: { flex: 0.6, textAlign: "right" },
  colPu: { flex: 1.2, textAlign: "right" },
  colTot: { flex: 1.2, textAlign: "right" },

  // Sections (pattern repris du DevisPdf)
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
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: rules.hairline,
    borderBottomColor: colors.rule,
    paddingVertical: 5,
  },
  sectionSubtotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  sectionSubtotalLabel: {
    flex: 4.3,
    fontWeight: 700,
    fontSize: 6.5,
    letterSpacing: 1,
    color: colors.ink,
    textAlign: "right",
  },
  sectionSubtotalValue: {
    flex: 1.2,
    fontFamily: fonts.display,
    fontWeight: 700,
    fontSize: 8.5,
    color: colors.ink,
    textAlign: "right",
  },

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
  totauxSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
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
  totFinalLabel: { ...sectionLabel, fontSize: 7, color: colors.accentInk, marginBottom: 2 },
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

/**
 * `accent` : clé de la palette PDF de la société (C-PDF-ACCENT-PAR-COMPANY),
 * déjà résolue par la route (src/lib/pdf-accent.ts). Absent = Majorelle.
 */
export function FacturePdf({
  facture: factureBrute,
  accent,
}: {
  facture: FactureForPdf;
  accent?: PdfAccentKey;
}) {
  const ac = pdfAccentColors(accent);
  // Textes en NFC : accents décomposés recomposés (affichage uniquement).
  const facture = normalizeNfcDeep(factureBrute);
  const { client, logoUrl } = facture;
  const isAvoir = facture.type === "AVOIR";
  // #99 : facture récapitulative = plusieurs devis sources (une ligne par
  // devis, pas de décomposition CS/FG/marge — cf. Vanda).
  const isRecap = !!facture.devisList && facture.devisList.length > 0;

  const docTitreLabel = isAvoir ? "AVOIR" : "FACTURE";
  // Titre affiché en casse éditoriale (« Facture », « Avoir ») ; les
  // métadonnées du PDF gardent docTitreLabel.
  const docTitreAffiche = isAvoir ? "Avoir" : "Facture";
  // #98 : numéro nul en brouillon → "(Brouillon)". Sinon préfixe F/AV via helper.
  const numeroAffiche = facture.numero ? formatFactureNumero(facture) : null;
  const titreDoc = numeroAffiche
    ? `${docTitreLabel} N° ${numeroAffiche}`
    : `${docTitreLabel} (Brouillon)`;
  // Mention Factur-X en pied de page : pièces émises uniquement.
  const mentionFacturx = facturxMention(facture);
  // Période d'exploitation (#69) : texte unique, null si rien d'exploitable.
  const periodeTexte = formatPeriodeExploitation(facture);

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
  // Objet propre à la facture (snapshot) : prioritaire sur l'objet live du
  // devis, qui n'est alors plus répété dans la ligne « Réf. ». Pièces sans
  // objet (antérieures à la feature, récap) : rendu inchangé.
  const {
    objet: objetFacture,
    description: descriptionFacture,
    refSuffix,
  } = factureObjetDisplay(facture, ligneRef);

  // TOTAL HT affiche = base TVA = totalHt - remise (parite avec DevisPdf).
  // Sur les factures sans remise, totalHtNet === totalHt → aucune regression.
  // tva et totalTtc sont stockes calcules sur ce meme net.
  const totalHtNet = facture.totalHt - facture.remise;
  const absHt = Math.abs(totalHtNet);
  const absTva = Math.abs(facture.tva);
  const absTtc = Math.abs(facture.totalTtc);

  return (
    <Document
      title={titreDoc}
      author={facture.nomEmetteur}
      subject={objetFacture || ligneRef || ligneDescription}
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
            <Text style={s.docTitre}>{docTitreAffiche}</Text>
            <Text style={[s.docNumero, { color: ac.accent }]}>
              {numeroAffiche ? `N° ${numeroAffiche}` : "(Brouillon)"}
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
            {facture.dateReglement && (
              <Text style={s.docDate}>
                Date de règlement : {fmtDate(facture.dateReglement)}
              </Text>
            )}
          </View>
        </View>

        {/* ── Emetteur / Destinataire ────────────────────────────── */}
        <View style={s.partiesRow}>
          <View style={[s.partyBox, s.partyBoxLeft]}>
            <Text style={[s.partyLabel, { color: ac.accentInk }]}>ÉMETTEUR</Text>
            <Text style={s.partyName}>{facture.nomEmetteur}</Text>
            <Text style={s.partyDetail}>{facture.adresseEmetteur}</Text>
            <Text style={s.partyDetail}>SIRET : {facture.siretEmetteur}</Text>
            <Text style={s.partyDetail}>TVA : {facture.tvaIntraEmetteur}</Text>
          </View>
          <View style={s.partyBox}>
            <Text style={[s.partyLabel, { color: ac.accentInk }]}>DESTINATAIRE</Text>
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

        {/* ── Référence devis (facture mono) ────────────────────── */}
        {facture.devis && !isRecap && (
          <View style={s.refRow}>
            <Text style={s.refLabel}>Réf. :</Text>
            <Text style={s.refText}>
              {ligneDescription}
              {refSuffix ? ` — ${refSuffix}` : ""}
            </Text>
          </View>
        )}

        {/* ── Objet + description du projet (snapshot, rien si vide) ── */}
        {objetFacture && (
          <View style={s.objetRow}>
            <Text style={s.objetLabel}>Objet :</Text>
            <Text style={s.objetText}>{objetFacture}</Text>
          </View>
        )}
        {descriptionFacture && (
          <View style={s.descriptionBlock}>
            <Text style={s.descriptionText}>{descriptionFacture}</Text>
          </View>
        )}

        {/* ── Bandeau facture récapitulative (#99) ──────────────── */}
        {isRecap && (
          <View style={s.refRow}>
            <Text style={s.refLabel}>Facture récapitulative :</Text>
            <Text style={s.refText}>
              regroupe {facture.devisList!.length} devis
            </Text>
          </View>
        )}

        {/* ── N° BDC ────────────────────────────────────────────── */}
        {facture.numeroBdc && (
          <View style={s.bdcBlock}>
            <View style={s.bdcBox}>
              <Text style={s.bdcLabel}>N° BDC</Text>
              <Text style={s.bdcValue}>{facture.numeroBdc}</Text>
            </View>
          </View>
        )}

        {/* ── Période d'exploitation (snapshot du devis, ticket #69) ── */}
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

        {/* ── Détail des prestations ─────────────────────────────
            Sections/lignes lues depuis le devis lié, valeurs ramenées
            au prorata (ratio = facture.totalHt / devis.totalHt).
            Fallback single-line si pas de devis (NONNA/SACEM) ou avoir. */}
        {(() => {
          // #99 : facture récapitulative → une ligne par devis source
          // (réf D26XXX + objet + total HT du devis), puis TOTAL global dans
          // le bloc totaux. Pas de décomposition par section.
          if (isRecap) {
            const devisList = facture.devisList!;
            return (
              <View style={s.amountsBlock}>
                <View style={s.amountsTable}>
                  <View style={s.amountsHead}>
                    <Text style={[s.thText, s.colTag]}>Devis</Text>
                    <Text style={[s.thText, s.colDesc]}>Objet</Text>
                    <Text style={[s.thText, s.colTot]}>Total HT</Text>
                  </View>
                  {devisList.map((d) => (
                    <View key={d.id} style={s.amountsRow}>
                      <Text style={[s.tdText, s.colTag]}>D{d.numero}</Text>
                      <Text style={[s.tdText, s.colDesc]}>{d.objet}</Text>
                      <Text style={[s.tdRight, s.colTot]}>{euros(d.montantHt)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }

          const hasDetail =
            !isAvoir &&
            facture.devis &&
            facture.devis.sections.length > 0 &&
            facture.devis.totalHt > 0;

          if (!hasDetail) {
            return (
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
            );
          }

          const devis = facture.devis!;
          const ratio = facture.totalHt / devis.totalHt;
          return (
            <View>
              {devis.sections.map((section) => {
                const sectionLignesAdj = section.lignes.map((l) => ({
                  ...l,
                  prixUnit: Math.round(l.prixUnit * ratio * 100) / 100,
                  total: Math.round(l.total * ratio * 100) / 100,
                }));
                const sectionSubtotal =
                  Math.round(
                    sectionLignesAdj.reduce((s, l) => s + l.total, 0) * 100
                  ) / 100;
                return (
                  <View key={section.id} style={s.sectionBlock} wrap={false}>
                    <Text style={s.sectionTitle}>{section.titre}</Text>
                    <View style={s.tableHead}>
                      <Text style={[s.thText, s.colLib]}>Libellé</Text>
                      <Text style={[s.thText, s.colTag]}>Catégorie</Text>
                      <Text style={[s.thText, s.colQte]}>Qté</Text>
                      <Text style={[s.thText, s.colPu]}>P.U. HT</Text>
                      <Text style={[s.thText, s.colTot]}>Total HT</Text>
                    </View>
                    {sectionLignesAdj.map((l) => (
                      <View key={l.id} style={s.tableRow}>
                        <View style={[s.colLib, { flexDirection: "column" }]}>
                          <Text style={s.tdText}>{l.libelle}</Text>
                          {/* Fallback robuste : horsMarge optionnel — si le
                              devis source a été supprimé ou si le champ
                              manque, on n'affiche simplement pas le badge.
                              Le montant snapshoté de la facture reste
                              correct quoi qu'il arrive. */}
                          {l.horsMarge === true && (
                            <View style={s.badge}>
                              <Text style={s.badgeText}>hors marge &amp; FG</Text>
                            </View>
                          )}
                          {l.horsCS === true && (
                            <View style={s.badge}>
                              <Text style={s.badgeText}>hors charges sociales</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[s.tdText, s.colTag]}>
                          {TAG_LABELS[l.tag] ?? l.tag}
                        </Text>
                        <Text style={[s.tdRight, s.colQte]}>{qte(l.quantite)}</Text>
                        <Text style={[s.tdRight, s.colPu]}>{euros(l.prixUnit)}</Text>
                        <Text style={[s.tdRight, s.colTot]}>{euros(l.total)}</Text>
                      </View>
                    ))}
                    <View style={s.sectionSubtotalRow}>
                      <Text style={s.sectionSubtotalLabel}>
                        SOUS TOTAL {section.titre.toUpperCase()}
                      </Text>
                      <Text style={s.sectionSubtotalValue}>
                        {euros(sectionSubtotal)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* ── Totaux ──────────────────────────────────────────── */}
        {(() => {
          // #99 : pas de décomposition CS/FG/marge sur une récap — les lignes
          // par devis totalisent déjà le HT tout compris. On affiche seulement
          // TOTAL HT / TVA / TTC.
          const hasBreakdown = !isAvoir && !isRecap && facture.sousTotal > 0;
          const detailRows = hasBreakdown
            ? [
                { label: "Charges sociales / comédien",    taux: facture.tauxCsComedien, montant: facture.csComedien },
                { label: "Charges sociales / techniciens", taux: facture.tauxCsTech,     montant: facture.csTechniciens },
                { label: "Frais généraux",                 taux: facture.tauxFg,         montant: facture.fraisGeneraux },
                { label: "Marge de fonctionnement",        taux: facture.tauxMarge,      montant: facture.marge },
              ].filter((r) => r.montant !== 0)
            : [];
          return (
            <View style={s.totauxSection} wrap={false}>
              <View style={s.totauxBox}>
                {hasBreakdown && (
                  <>
                    <View style={s.totRow}>
                      <Text style={s.totLabel}>SOUS TOTAL HT</Text>
                      <Text style={s.totValue}>{euros(facture.sousTotal)}</Text>
                    </View>
                    {detailRows.length > 0 && <View style={{ height: 4 }} />}
                    {detailRows.map((r) => (
                      <View key={r.label} style={s.totRow}>
                        <Text style={[s.totLabel, { flex: 1 }]}>{r.label}</Text>
                        <Text style={[s.totPct, { width: 40, textAlign: "right" }]}>
                          {pct(r.taux)}
                        </Text>
                        <Text style={[s.totValue, { width: 65, textAlign: "right" }]}>
                          {euros(r.montant)}
                        </Text>
                      </View>
                    ))}
                    {facture.coproduction !== 0 && (
                      <View style={s.totRow}>
                        <Text style={s.totLabel}>Co-production</Text>
                        <Text style={s.totValue}>{euros(-facture.coproduction)}</Text>
                      </View>
                    )}
                    {facture.remise !== 0 && (
                      <View style={s.totRow}>
                        <Text style={s.totLabel}>Remise exceptionnelle</Text>
                        <Text style={s.totValue}>{euros(-facture.remise)}</Text>
                      </View>
                    )}
                    <View style={s.totDivider} />
                  </>
                )}
                <View style={s.totRow}>
                  <Text style={s.totHtLabel}>TOTAL HT</Text>
                  <Text style={s.totHtValue}>
                    {isAvoir ? `- ${euros(absHt)}` : euros(absHt)}
                  </Text>
                </View>
                {facture.tauxTva === 0 ? (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>TVA non applicable</Text>
                    <Text style={s.totValue}>—</Text>
                  </View>
                ) : (
                  <View style={s.totRow}>
                    <Text style={s.totLabel}>TVA {facture.tauxTva % 1 === 0 ? facture.tauxTva.toFixed(0) : String(facture.tauxTva).replace(".", ",")} %</Text>
                    <Text style={s.totValue}>
                      {isAvoir ? `- ${euros(absTva)}` : euros(absTva)}
                    </Text>
                  </View>
                )}
                <View style={s.totFinalRow}>
                  <Text style={[s.totFinalLabel, { color: ac.accentInk }]}>
                    {isAvoir ? "MONTANT DE L'AVOIR TTC" : "TOTAL TTC"}
                  </Text>
                  <Text style={[s.totFinalValue, { color: ac.accent }]}>
                    {isAvoir ? `- ${euros(absTtc)}` : euros(absTtc)}
                  </Text>
                </View>
                {/* Mention légale TVA — visible uniquement si TVA=0 */}
                {facture.tauxTva === 0 && (
                  <View style={[s.totRow, { marginTop: 4 }]}>
                    <Text style={s.tvaMention}>
                      {facture.tvaMention || "Art. 293 B du CGI"}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        {/* ── Mentions légales art. L441-9 C. com. ─────────────── */}
        {!isAvoir && (
          <View style={s.mentionsBlock} wrap={false}>
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
          {mentionFacturx && <Text style={s.footerText}>{mentionFacturx}</Text>}
          <Text
            style={s.pageNum}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
