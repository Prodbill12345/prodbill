import { colors } from "@/design/tokens";

/**
 * Mascotte ProdBill (C-REDESIGN-PHASE2-APP) : portrait graphique, pas une
 * mascotte « mignonne ». Tête organique allongée et légèrement penchée, cou
 * et début de buste coupés par le bord du cadre, grandes lunettes en masque
 * (deux ovales larges qui se touchent) à verres noirs opaques, nez en angle,
 * bouche neutre. Expression impassible. Contour noir irrégulier « dessiné
 * main », aplats francs. Ambiance : pochette de disque / Keith Haring.
 * SVG pur : net à toutes les tailles.
 *
 * Emplacements prévus : connexion, coin du héros du dashboard, états vides,
 * 404 / erreur. Jamais dans les tableaux de données ni les formulaires.
 *
 * Décorative par défaut (aria-hidden). Passer `title` pour en faire une
 * image accessible (ex. seule illustration d'un état vide).
 */
export function Mascot({
  size = 120,
  title,
  className,
}: {
  size?: number | string;
  title?: string;
  className?: string;
}) {
  const ink = colors.ink;
  const a11y = title
    ? { role: "img" as const, "aria-label": title }
    : { "aria-hidden": true as const, focusable: "false" as const };

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      {...a11y}
    >
      {title ? <title>{title}</title> : null}

      {/* Silhouette : tête allongée asymétrique (penchée vers la gauche),
          cou, début de buste. Le tracé sort du cadre en bas : portrait coupé. */}
      <path
        d="M24 208
           C 30 186, 50 175, 79 170
           C 83 161, 83 153, 78 146
           C 56 131, 45 103, 49 74
           C 53 42, 75 17, 105 16
           C 137 15, 158 40, 160 72
           C 162 103, 154 128, 136 145
           C 131 153, 130 162, 133 170
           C 160 176, 178 189, 184 208 Z"
        fill={colors.pistachio}
        stroke={ink}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {/* Reprises de trait : contour « dessiné main » */}
      <path d="M96 18 C 104 15, 114 15, 122 18" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" />
      <path d="M49 79 C 48 90, 49 99, 52 108" fill="none" stroke={ink} strokeWidth={2.5} strokeLinecap="round" />

      {/* Lunettes en masque, posées bas, légèrement inclinées avec la tête.
          1) montures blanches cernées de noir ; 2) re-remplissage blanc pour
          effacer le cerne à la jonction (union propre en « 8 couché ») ;
          3) verres noirs opaques, sans reflet. */}
      <g transform="rotate(-5 108 100)">
        <ellipse cx={78} cy={100} rx={33} ry={19} fill="#FFFFFF" stroke={ink} strokeWidth={4.5} />
        <ellipse cx={140} cy={100} rx={33} ry={19} fill="#FFFFFF" stroke={ink} strokeWidth={4.5} />
        <ellipse cx={78} cy={100} rx={31} ry={17} fill="#FFFFFF" />
        <ellipse cx={140} cy={100} rx={31} ry={17} fill="#FFFFFF" />
        <ellipse cx={79} cy={100.5} rx={24} ry={11.5} fill={ink} />
        <ellipse cx={139} cy={100.5} rx={24} ry={11.5} fill={ink} />
      </g>

      {/* Nez : un angle simple */}
      <path d="M111 115 L 104 128 L 112 129" fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Bouche : trait neutre */}
      <path d="M97 140 L 115 139" fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
    </svg>
  );
}
