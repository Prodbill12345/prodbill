/**
 * Tokens de la DA ProdBill (reprise du site « à deux », DA validée par Rose
 * et Vanda le 27/10/2026). Source de vérité partagée :
 *   - phase 1 (C-REDESIGN-PHASE1-PDF) : déclinaison assagie des documents
 *     clients (DevisPdf, FacturePdf) ;
 *   - phase 2 : l'app entière (DA complète) partira de ce fichier.
 *
 * Règles PDF : pas de rouge/vert/rose (réservés à l'app), accent bleu réservé
 * aux éléments clés (numéro du document, libellés de section, total final).
 */

export const colors = {
  /** Fond des documents (le PDF entier, pas blanc pur). */
  cream: "#F7F5EE",
  /** Texte principal — noir olive. */
  ink: "#25251F",
  /** Texte secondaire (libellés de colonnes, métadonnées). Dérivé de ink. */
  inkMuted: "#6E6E62",
  /** Texte tertiaire (pied de page, mentions discrètes). Dérivé de ink. */
  inkSubtle: "#97978A",
  /** Accent — bleu électrique, éléments clés uniquement. */
  accent: "#2115ED",
  /** Bordures et filets (0.5–0.75 pt). */
  rule: "#DEDED2",
  /** Fond secondaire (bloc récapitulatif). */
  surface: "#EDEEE2",
} as const;

export const fonts = {
  /** Titres, numéro du document, montants (chiffres tabulaires). */
  display: "Space Grotesk",
  /** Tout le reste. */
  text: "DM Sans",
} as const;

/** Épaisseurs de filet (pt). */
export const rules = {
  hairline: 0.5,
  thin: 0.75,
} as const;

/** Libellés de section en capitales espacées (« ÉMETTEUR », « TOTAL TTC »). */
export const sectionLabel = {
  fontFamily: fonts.text,
  fontWeight: 500,
  fontSize: 6.5,
  letterSpacing: 2,
  textTransform: "uppercase",
} as const;
