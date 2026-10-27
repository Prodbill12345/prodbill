/**
 * Enregistrement des polices des documents clients (C-REDESIGN-PHASE1-PDF).
 * Module à effet de bord, importé par DevisPdf et FacturePdf.
 *
 * Fichiers lus depuis le disque (src/assets/fonts) : sur Vercel, ils sont
 * embarqués dans les fonctions via outputFileTracingIncludes (next.config.ts).
 * react-pdf sous-ensemble les polices à l'intégration : seuls les glyphes
 * utilisés partent dans le PDF.
 */

import path from "path";
import { Font } from "@react-pdf/renderer";
import { fonts } from "@/design/tokens";

const dir = path.join(process.cwd(), "src/assets/fonts");
const file = (name: string) => path.join(dir, name);

Font.register({
  family: fonts.text,
  fonts: [
    { src: file("DMSans-Regular.ttf"), fontWeight: 400 },
    { src: file("DMSans-Medium.ttf"), fontWeight: 500 },
    { src: file("DMSans-Bold.ttf"), fontWeight: 700 },
  ],
});

Font.register({
  family: fonts.display,
  fonts: [
    { src: file("SpaceGrotesk-Medium.ttf"), fontWeight: 500 },
    { src: file("SpaceGrotesk-Bold.ttf"), fontWeight: 700 },
  ],
});
