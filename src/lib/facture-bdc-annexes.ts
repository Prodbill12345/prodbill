/**
 * src/lib/facture-bdc-annexes.ts
 *
 * Helpers PURS pour l'annexion des BDC client au PDF de facture
 * (C-FACTURE-PDF-BDC, étapes 1-2 — le branchement de la route attend la
 * confirmation de Vanda sur le format, fichier unique vs fichiers séparés).
 *
 * Le BDC client (ticket #79) est le bon de commande reçu DU client, stocké
 * sur Vercel Blob au niveau du DEVIS (Devis.bdcClientUrl, PDF/JPG/PNG).
 * Une facture peut donc porter de 0 à N BDC :
 *   - facture mono-devis : 0 ou 1
 *   - facture récapitulative (#99) : jusqu'à un par devis source
 *
 * Ce module ne fait QUE décider quoi annexer et dans quel ordre. L'assemblage
 * PDF vit dans src/lib/pdf/append-annexes.ts, et la détection de format se
 * fait sur les octets (cf. detectAnnexeKind) et non sur le nom de fichier :
 * la route d'upload contraint le MIME mais pas l'extension du nom d'origine.
 */

/**
 * Plafond cumulé des annexes. Au-delà, les annexes excédentaires sont
 * omises et signalées (cf. annexesOmissionNotice) plutôt que de produire
 * un PDF que Resend refusera en pièce jointe — ou un timeout silencieux.
 * Un récap à 8 devis peut sinon atteindre 80 Mo (10 Mo/BDC à l'upload).
 */
export const ANNEXES_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** Projection minimale d'un devis source, telle que sélectionnée en base. */
export interface DevisForBdcAnnexe {
  id: string;
  /** Numéro du devis ("26001"). NULL sur un devis pas encore numéroté. */
  numero: string | null;
  bdcClientUrl: string | null;
  bdcClientFilename: string | null;
}

export interface BdcAnnexe {
  devisId: string;
  devisNumero: string | null;
  url: string;
  /** Nom d'origine, pour les messages utilisateur. Jamais vide. */
  filename: string;
}

/**
 * Construit la liste ordonnée des BDC à annexer.
 *
 * - L'ordre d'entrée est conservé : sur un récap, c'est l'ordre des devis de
 *   la facture (même ordre que les lignes du PDF récap).
 * - Les devis sans BDC sont écartés silencieusement (cas majoritaire).
 * - Déduplication par URL : deux devis ne peuvent pas pointer le même blob
 *   aujourd'hui (un upload = un blob), mais un doublon produirait une annexe
 *   en double dans le PDF. Garde-fou défensif, première occurrence gagnante.
 */
export function collectBdcAnnexes(
  devisList: readonly DevisForBdcAnnexe[]
): BdcAnnexe[] {
  const annexes: BdcAnnexe[] = [];
  const seenUrls = new Set<string>();

  for (const devis of devisList) {
    const url = devis.bdcClientUrl?.trim();
    if (!url) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    annexes.push({
      devisId: devis.id,
      devisNumero: devis.numero,
      url,
      // bdcClientFilename est renseigné par la route d'upload, mais reste
      // nullable en base (imports, écritures manuelles).
      filename: devis.bdcClientFilename?.trim() || "bdc-client",
    });
  }

  return annexes;
}

export interface AnnexesPlan {
  included: BdcAnnexe[];
  omitted: BdcAnnexe[];
  /** Somme des tailles retenues, en octets. */
  totalBytes: number;
}

/**
 * Applique le plafond de poids. `sizes` est parallèle à `annexes` (taille en
 * octets de chaque annexe, connue seulement après téléchargement ou HEAD).
 *
 * Stratégie gloutonne AVEC poursuite : une annexe trop lourde est omise mais
 * n'interrompt pas le parcours — une petite annexe qui la suit peut encore
 * entrer. On privilégie ainsi le nombre de BDC joints plutôt que l'ordre
 * strict, l'ordre relatif des annexes retenues restant celui des devis.
 *
 * Une taille négative ou non finie est traitée comme 0 (défensif : une
 * réponse HTTP sans Content-Length ne doit pas faire sauter le plafond).
 */
export function planAnnexes(
  annexes: readonly BdcAnnexe[],
  sizes: readonly number[],
  maxTotalBytes: number = ANNEXES_MAX_TOTAL_BYTES
): AnnexesPlan {
  if (sizes.length !== annexes.length) {
    throw new Error(
      `planAnnexes: ${annexes.length} annexes pour ${sizes.length} tailles`
    );
  }

  const included: BdcAnnexe[] = [];
  const omitted: BdcAnnexe[] = [];
  let totalBytes = 0;

  for (let i = 0; i < annexes.length; i++) {
    const size = normalizeSize(sizes[i]);
    if (totalBytes + size > maxTotalBytes) {
      omitted.push(annexes[i]);
      continue;
    }
    included.push(annexes[i]);
    totalBytes += size;
  }

  return { included, omitted, totalBytes };
}

/**
 * Mention à imprimer dans le PDF quand des annexes ont été écartées.
 * Retourne NULL s'il n'y a rien à signaler — le cas normal.
 *
 * Le message nomme les devis concernés : Vanda doit pouvoir récupérer les
 * BDC manquants depuis la fiche devis sans avoir à deviner lesquels.
 */
export function annexesOmissionNotice(
  omitted: readonly BdcAnnexe[],
  maxTotalBytes: number = ANNEXES_MAX_TOTAL_BYTES
): string | null {
  if (omitted.length === 0) return null;

  const mo = Math.round(maxTotalBytes / (1024 * 1024));
  const liste = omitted
    .map((a) => `${formatDevisRef(a.devisNumero)} (${a.filename})`)
    .join(", ");
  const pluriel = omitted.length > 1;

  return (
    `${omitted.length} bon${pluriel ? "s" : ""} de commande n'${pluriel ? "ont" : "a"} pas pu être ` +
    `joint${pluriel ? "s" : ""} à ce PDF : la limite de ${mo} Mo d'annexes est atteinte. ` +
    `Concerne ${liste}. ` +
    `${pluriel ? "Ces documents restent téléchargeables" : "Ce document reste téléchargeable"} ` +
    `depuis la fiche du devis correspondant.`
  );
}

/** Référence lisible d'un devis : "D26001", ou "(devis sans numéro)". */
export function formatDevisRef(numero: string | null): string {
  return numero ? `D${numero}` : "(devis sans numéro)";
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size) || size < 0) return 0;
  return size;
}
