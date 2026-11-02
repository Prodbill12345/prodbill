/**
 * src/lib/pdf-filename.ts — nom des PDF téléchargés et joints
 * (C-NOM-FICHIERS-PDF, demande Vanda du 02/11/2026).
 *
 * Format : « {numéro} - {client} - {titre}.pdf », ex.
 *   D26032 - MNSTR - Netflix “L'appartement” - Vignetting.pdf
 *   F26122 - ARTEFACT - TotalEnergies - 1 Spot radio.pdf
 * Titre vide → « {numéro} - {client}.pdf ».
 *
 * Nettoyage (`cleanFilenamePart`) :
 *   - NFC (accents recomposés), retours à la ligne et tabulations → espace ;
 *   - guillemets droits " → typographiques “ ” (ouvrant / fermant selon la
 *     position) ;
 *   - retire / \ : * ? < > | et les caractères de contrôle ;
 *   - espaces multiples réduits, bords nettoyés (y compris points finaux,
 *     refusés par Windows).
 * Longueur : 120 caractères max avant « .pdf ». Le titre est tronqué en
 * premier (sur un mot, avec « … »), puis le client si besoin ; le numéro
 * jamais.
 *
 * Titre : l'objet du devis, tel que Vanda l'écrit (validé par Rose le
 * 02/11/2026). Elle y met déjà le client FINAL (« D26366 - LA MAISON NOIRE -
 * Helena Rubinstein… »), qui n'est pas forcément le client facturé de la fiche
 * (D26032 : objet « MNSTR - … », client facturé MENUXL). Le préfixe
 * « D<numéro> » est retiré : le numéro du nom de fichier est toujours celui du
 * document, jamais celui écrit dans l'objet (qui peut être une coquille). La
 * fiche client ne sert que si l'objet est vide.
 */

const MAX_BASE_LEN = 120;
const MIN_TITLE_LEN = 12;

/** Nettoie un morceau de nom de fichier (voir l'en-tête). */
export function cleanFilenamePart(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.normalize("NFC").replace(/[\r\n\t]+/g, " ");
  // Guillemets droits → typographiques : ouvrant en début ou après un
  // espace / une parenthèse ouvrante, fermant sinon.
  s = s.replace(/"/g, (_m, offset: number, str: string) => {
    const prev = offset > 0 ? str[offset - 1] : "";
    return prev === "" || /[\s([{]/.test(prev) ? "“" : "”";
  });
  s = s
    .replace(/[\\/:*?<>|]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
  return s;
}

/** Retire en tête de l'objet « D26366 - », « D26365 ✘ - », « D25722 (2026) - ». */
export function stripDevisRefPrefix(objet: string): string {
  return objet.replace(/^\s*D\d{3,}\b[^\n\-–—]{0,20}?\s*[-–—]\s+/u, "");
}

/** Tronque sur un mot, avec « … », sans dépasser `max` caractères. */
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "";
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace >= max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s\-–—,;.]+$/, "")}…`;
}

export function buildPdfBaseName(params: {
  /** Numéro affiché : « D26032 », « F26122 », « AV-F26122 », « Brouillon ». */
  numero: string;
  client: string | null | undefined;
  titre: string | null | undefined;
}): string {
  const numero = cleanFilenamePart(params.numero) || "Document";
  const titre = cleanFilenamePart(stripDevisRefPrefix(params.titre ?? ""));
  // Objet renseigné : il porte déjà le client final. Sinon, client facturé.
  const client = titre ? "" : cleanFilenamePart(params.client);

  const join = (c: string, t: string) => [numero, c, t].filter(Boolean).join(" - ");
  let c = client;
  let t = titre;
  if (join(c, t).length > MAX_BASE_LEN && t) {
    const room = MAX_BASE_LEN - join(c, "").length - 3;
    t = room >= MIN_TITLE_LEN ? truncate(t, room) : "";
  }
  if (join(c, t).length > MAX_BASE_LEN && c) {
    c = truncate(c, Math.max(MAX_BASE_LEN - join("", t).length - 3, MIN_TITLE_LEN));
  }
  return join(c, t);
}

/** « D26032 » à partir du numéro stocké (« 26032 ») ; préfixe société conservé. */
export function devisNumeroForFilename(numero: string | null): string {
  if (!numero) return "Brouillon";
  return /^\d/.test(numero) ? `D${numero}` : numero;
}

/** « F26122 », « AV-… » ou « Brouillon » (même règle que l'affichage). */
export function factureNumeroForFilenameLabel(numero: string | null): string {
  if (!numero) return "Brouillon";
  if (numero.startsWith("AV-")) return numero;
  return /^\d/.test(numero) ? `F${numero}` : numero;
}

export function devisPdfFilename(devis: {
  numero: string | null;
  objet: string | null;
  client?: { name: string } | null;
}): string {
  return `${buildPdfBaseName({
    numero: devisNumeroForFilename(devis.numero),
    client: devis.client?.name,
    titre: devis.objet,
  })}.pdf`;
}

/**
 * Facture, avoir, récap. Titre : objet figé de la facture, sinon objet du
 * devis source ; une récap (N devis, pas d'objet) prend « numéro - client ».
 * `suffix` : « Factur-X » pour distinguer le conteneur du PDF simple.
 */
export function facturePdfFilename(
  facture: {
    numero: string | null;
    objet?: string | null;
    client?: { name: string } | null;
    devis?: { objet: string | null } | null;
  },
  options: { suffix?: string } = {}
): string {
  const base = buildPdfBaseName({
    numero: factureNumeroForFilenameLabel(facture.numero),
    client: facture.client?.name,
    titre: facture.objet ?? facture.devis?.objet ?? null,
  });
  return `${options.suffix ? `${base} - ${options.suffix}` : base}.pdf`;
}

/**
 * En-tête Content-Disposition lisible par Chrome et Safari : `filename*` en
 * UTF-8 (RFC 6266 / 5987) garde accents et guillemets typographiques ;
 * `filename` en ASCII sert de repli aux clients anciens. Une valeur d'en-tête
 * HTTP ne peut pas contenir de caractère hors Latin-1 : le nom brut n'y est
 * donc jamais mis tel quel.
 */
export function contentDisposition(filename: string, type: "attachment" | "inline" = "attachment"): string {
  const ascii = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”«»]/g, "'")
    .replace(/[’‘]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "'");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
