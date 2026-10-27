/**
 * Tokens de la DA ProdBill (reprise du site « à deux », DA validée par Rose
 * et Vanda le 27/10/2026). Source de vérité partagée :
 *   - phase 1 (C-REDESIGN-PHASE1-PDF) : déclinaison assagie des documents
 *     clients (DevisPdf, FacturePdf) — colors, fonts, rules, sectionLabel ;
 *   - phase 2 (C-REDESIGN-PHASE2-APP) : l'app entière, via les variables CSS
 *     de src/app/globals.css (`cssVars` ci-dessous, synchro vérifiée par
 *     src/__tests__/design-tokens.test.ts).
 *
 * Règles : le crème domine ; le bleu souligne l'important et remplit les
 * grandes cartes ; rouge orangé, pistache et rose par petites touches. Pas de
 * rouge/vert/rose sur les PDF. À éviter : dégradés violets, effets de verre,
 * grosses ombres, accumulation de capsules, emojis comme icônes.
 *
 * Contrastes (WCAG, calculés le 27/10/2026) : ink/cream 14.1 ; inkMuted/cream
 * 5.3 et /surface 5.0 ; accent/cream 8.0 ; cream/accent 8.0. Rouge orangé et
 * pistache ne passent PAS en texte sur crème (2.6 et 1.5) : jamais de texte
 * dans ces couleurs, seulement des fonds, pastilles et détails graphiques.
 */

export const colors = {
  /** Fond principal (app et documents), crème chaud. */
  cream: "#F7F5EE",
  /** Cartes complémentaires « blanc chaud ». Dérivé du crème. */
  paper: "#FCFBF7",
  /** Texte principal — presque noir, légèrement olive. Capsule de nav active. */
  ink: "#25251F",
  /** Texte secondaire (labels, métadonnées). AA sur cream (5.3) et surface (5.0). */
  inkMuted: "#66665A",
  /** NON-TEXTE uniquement (2.7 sur crème) : icônes décoratives, états désactivés. */
  inkSubtle: "#97978A",
  /** Bleu électrique ultramarine — couleur signature. */
  accent: "#2115ED",
  /** Rouge orangé — sticker, alertes, pastille « refusé ». Jamais en texte sur crème. */
  coral: "#FF6846",
  /** Vert pistache — mascotte, pastille « payé / accepté ». Jamais en texte. */
  pistachio: "#B7D85D",
  /** Rose tendre — petites touches. */
  rose: "#FFBBD3",
  /** Bordures et filets. */
  rule: "#DEDED2",
  /** Fonds secondaires gris vert très clair (blocs récapitulatifs). */
  surface: "#EDEEE2",
} as const;

export const fonts = {
  /** Titres, grands chiffres, montants (chiffres tabulaires). */
  display: "Space Grotesk",
  /** Textes, menus, formulaires. */
  text: "DM Sans",
} as const;

/**
 * Piles CSS pour l'app. Les familles Space Grotesk / DM Sans sont chargées
 * par next/font (src/app/layout.tsx) qui expose --font-space-grotesk et
 * --font-dm-sans. Serif éditoriale (quelques mots en italique bleu dans les
 * grands titres) : Georgia système, zéro chargement.
 */
export const fontStacks = {
  display: "var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif",
  text: "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
  editorial: 'Georgia, "Times New Roman", serif',
} as const;

/** Épaisseurs de filet (pt pour les PDF, px pour l'app). */
export const rules = {
  hairline: 0.5,
  thin: 0.75,
} as const;

/** Rayons (px). Cartes 12–14px selon la spec. */
export const radii = {
  control: 10,
  card: 14,
  pill: 999,
} as const;

/** Animations discrètes et rapides ; désactivées sous prefers-reduced-motion. */
export const motion = {
  fast: "120ms",
  base: "180ms",
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * Tons des badges de statut : pastille (dot) + fond teinté léger + texte
 * lisible. Contrastes texte/fond ≥ 6.9 (AA). Mapping statut → ton :
 * src/design/status.ts.
 *   neutral   → Brouillon
 *   info      → Envoyé / Émise
 *   validated → Validé (en interne) — pistache en contour, distinct d'Accepté
 *   success   → Accepté / Payée — pistache en aplat teinté
 *   partial   → Paiement partiel — rose tendre
 *   danger    → Refusé / Annulée / En retard
 *   muted     → Expiré
 */
export const statusTones = {
  neutral: { dot: colors.inkMuted, bg: colors.surface, text: colors.ink, border: colors.surface },
  info: { dot: colors.accent, bg: "#E4E3FC", text: colors.accent, border: "#E4E3FC" },
  validated: { dot: "#8DB136", bg: "transparent", text: colors.ink, border: "#8DB136" },
  success: { dot: "#8DB136", bg: "#E6F0C6", text: colors.ink, border: "#E6F0C6" },
  partial: { dot: "#F48FB4", bg: "#FFE4ED", text: colors.ink, border: "#FFE4ED" },
  danger: { dot: colors.coral, bg: "#FFE1D8", text: colors.ink, border: "#FFE1D8" },
  muted: { dot: colors.inkSubtle, bg: "transparent", text: colors.inkMuted, border: colors.rule },
} as const;

export type StatusTone = keyof typeof statusTones;

/** Libellés de section en capitales espacées (« ÉMETTEUR », « TOTAL TTC »). */
export const sectionLabel = {
  fontFamily: fonts.text,
  fontWeight: 500,
  fontSize: 6.5,
  letterSpacing: 2,
  textTransform: "uppercase",
} as const;

/**
 * Variables CSS exposées à Tailwind (@theme de src/app/globals.css). Le test
 * design-tokens vérifie que chaque entrée y figure avec la même valeur.
 * Préfixe « brand » : pas de collision avec la palette Tailwind (rose-*…).
 */
export const cssVars: Record<string, string> = {
  "--color-brand-cream": colors.cream,
  "--color-brand-paper": colors.paper,
  "--color-brand-ink": colors.ink,
  "--color-brand-ink-muted": colors.inkMuted,
  "--color-brand-ink-subtle": colors.inkSubtle,
  "--color-brand-blue": colors.accent,
  "--color-brand-coral": colors.coral,
  "--color-brand-pistachio": colors.pistachio,
  "--color-brand-rose": colors.rose,
  "--color-brand-rule": colors.rule,
  "--color-brand-surface": colors.surface,
  "--color-status-neutral-bg": statusTones.neutral.bg,
  "--color-status-neutral-dot": statusTones.neutral.dot,
  "--color-status-info-bg": statusTones.info.bg,
  "--color-status-info-text": statusTones.info.text,
  "--color-status-success-bg": statusTones.success.bg,
  "--color-status-success-dot": statusTones.success.dot,
  "--color-status-danger-bg": statusTones.danger.bg,
  "--color-status-danger-dot": statusTones.danger.dot,
  "--font-display": fontStacks.display,
  "--font-text": fontStacks.text,
  "--font-editorial": fontStacks.editorial,
  "--radius-card": `${radii.card}px`,
  "--radius-control": `${radii.control}px`,
};
