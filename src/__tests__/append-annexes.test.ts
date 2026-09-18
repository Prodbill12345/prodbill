/**
 * Tests de l'assemblage pdf-lib des annexes (C-FACTURE-PDF-BDC).
 *
 * Ces tests manipulent de vrais documents PDF/PNG/JPEG en mémoire : c'est le
 * seul moyen de vérifier que le BDC image est réellement embarquable, la
 * régression la plus probable de ce module.
 */

import { PDFDocument, StandardFonts, PageSizes } from "pdf-lib";
import {
  detectAnnexeKind,
  appendAnnexe,
  appendImageAsPage,
  appendNoticePage,
  fitWithin,
  wrapText,
} from "../lib/pdf/append-annexes";

/** PNG 1×1 transparent. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

/** JPEG 1×1 blanc (baseline, tables de quantification minimales). */
const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64"
);

/** Construit un PDF de `pageCount` pages A4 et renvoie ses octets. */
async function makePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage(PageSizes.A4);
  return doc.save();
}

describe("detectAnnexeKind", () => {
  test("PDF reconnu par la signature %PDF", async () => {
    expect(detectAnnexeKind(await makePdfBytes(1))).toBe("pdf");
  });

  test("PNG reconnu par sa signature", () => {
    expect(detectAnnexeKind(new Uint8Array(PNG_1PX))).toBe("png");
  });

  test("JPEG reconnu par son marqueur SOI", () => {
    expect(detectAnnexeKind(new Uint8Array(JPEG_1PX))).toBe("jpeg");
  });

  test("format inconnu : null (annexe ignorée, pas d'échec du PDF)", () => {
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(detectAnnexeKind(docx)).toBeNull();
  });

  test("buffer vide ou tronqué : null, sans lever d'exception", () => {
    expect(detectAnnexeKind(new Uint8Array([]))).toBeNull();
    expect(detectAnnexeKind(new Uint8Array([0x25, 0x50]))).toBeNull();
    expect(detectAnnexeKind(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  test("les octets priment sur l'extension : un PDF nommé .jpg reste un PDF", async () => {
    // La route d'upload #79 conserve le nom d'origine du client, qui peut
    // mentir ou n'avoir aucune extension — d'où la détection par octets.
    expect(detectAnnexeKind(await makePdfBytes(1))).toBe("pdf");
  });
});

describe("appendAnnexe", () => {
  test("annexe PDF : toutes ses pages sont ajoutées", async () => {
    const target = await PDFDocument.create();
    target.addPage(PageSizes.A4); // la facture
    const added = await appendAnnexe(target, await makePdfBytes(3));

    expect(added).toBe(3);
    expect(target.getPageCount()).toBe(4);
  });

  test("annexe PNG : exactement une page A4", async () => {
    const target = await PDFDocument.create();
    const added = await appendAnnexe(target, new Uint8Array(PNG_1PX));

    expect(added).toBe(1);
    expect(target.getPageCount()).toBe(1);
    const { width, height } = target.getPage(0).getSize();
    expect(Math.round(width)).toBe(Math.round(PageSizes.A4[0]));
    expect(Math.round(height)).toBe(Math.round(PageSizes.A4[1]));
  });

  test("annexe JPEG : exactement une page (cas du BDC scanné)", async () => {
    const target = await PDFDocument.create();
    const added = await appendAnnexe(target, new Uint8Array(JPEG_1PX));

    expect(added).toBe(1);
    expect(target.getPageCount()).toBe(1);
  });

  test("format non annexable : 0 page, aucune exception", async () => {
    const target = await PDFDocument.create();
    target.addPage(PageSizes.A4);
    const added = await appendAnnexe(target, new Uint8Array([1, 2, 3, 4, 5]));

    expect(added).toBe(0);
    expect(target.getPageCount()).toBe(1);
  });

  test("plusieurs annexes hétérogènes : ordre et pagination cumulés", async () => {
    // Cas récap : un BDC PDF 2 pages, puis un BDC scanné, puis un fichier
    // corrompu qui ne doit pas casser la chaîne.
    const target = await PDFDocument.create();
    target.addPage(PageSizes.A4);

    await appendAnnexe(target, await makePdfBytes(2));
    await appendAnnexe(target, new Uint8Array(PNG_1PX));
    await appendAnnexe(target, new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

    expect(target.getPageCount()).toBe(4);
  });

  test("le document produit reste rechargeable (PDF valide)", async () => {
    const target = await PDFDocument.create();
    target.addPage(PageSizes.A4);
    await appendAnnexe(target, new Uint8Array(PNG_1PX));

    const reloaded = await PDFDocument.load(await target.save());
    expect(reloaded.getPageCount()).toBe(2);
  });
});

describe("fitWithin", () => {
  test("image plus grande que la zone : réduite, ratio préservé", () => {
    const fit = fitWithin(2000, 1000, 500, 500);
    expect(fit).toEqual({ width: 500, height: 250 });
  });

  test("contrainte par la hauteur", () => {
    const fit = fitWithin(1000, 2000, 500, 500);
    expect(fit).toEqual({ width: 250, height: 500 });
  });

  test("image plus petite que la zone : PAS d'agrandissement", () => {
    // Agrandir un scan basse résolution le rendrait illisible.
    expect(fitWithin(100, 50, 500, 500)).toEqual({ width: 100, height: 50 });
  });

  test("image exactement à la taille de la zone : inchangée", () => {
    expect(fitWithin(500, 500, 500, 500)).toEqual({ width: 500, height: 500 });
  });

  test("dimensions nulles ou négatives : 0×0, pas de NaN ni d'Infinity", () => {
    expect(fitWithin(0, 100, 500, 500)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(-10, 100, 500, 500)).toEqual({ width: 0, height: 0 });
  });
});

describe("appendImageAsPage", () => {
  test("l'image est centrée dans la page A4", async () => {
    const target = await PDFDocument.create();
    await appendImageAsPage(target, new Uint8Array(PNG_1PX), "png");
    expect(target.getPageCount()).toBe(1);
  });
});

describe("wrapText", () => {
  async function helvetica() {
    const doc = await PDFDocument.create();
    return doc.embedFont(StandardFonts.Helvetica);
  }

  test("texte court : une seule ligne", async () => {
    const font = await helvetica();
    expect(wrapText("Bon de commande", font, 10, 500)).toEqual([
      "Bon de commande",
    ]);
  });

  test("texte long : découpé, chaque ligne tient dans la largeur", async () => {
    const font = await helvetica();
    const texte =
      "2 bons de commande n'ont pas pu être joints à ce PDF : la limite de 20 Mo d'annexes est atteinte.";
    const lines = wrapText(texte, font, 10, 200);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 10)).toBeLessThanOrEqual(200);
    }
    // Aucun mot perdu ni dupliqué au passage à la ligne.
    expect(lines.join(" ")).toBe(texte);
  });

  test("mot plus long que la largeur : sa propre ligne, non coupé", async () => {
    const font = await helvetica();
    const lines = wrapText("BDC-CALESON-2026-SCAN-RECTO-VERSO.pdf", font, 10, 20);
    expect(lines).toEqual(["BDC-CALESON-2026-SCAN-RECTO-VERSO.pdf"]);
  });

  test("texte vide ou blanc : aucune ligne", async () => {
    const font = await helvetica();
    expect(wrapText("", font, 10, 500)).toEqual([]);
    expect(wrapText("   \n  ", font, 10, 500)).toEqual([]);
  });
});

describe("appendNoticePage", () => {
  test("ajoute une page A4 contenant la mention", async () => {
    const target = await PDFDocument.create();
    target.addPage(PageSizes.A4);

    await appendNoticePage(target, "Annexes incomplètes", [
      "2 bons de commande n'ont pas pu être joints à ce PDF : la limite de 20 Mo d'annexes est atteinte.",
      "Concerne D26001 (scan1.jpg), D26002 (scan2.pdf).",
    ]);

    expect(target.getPageCount()).toBe(2);
    const { width, height } = target.getPage(1).getSize();
    expect(Math.round(width)).toBe(Math.round(PageSizes.A4[0]));
    expect(Math.round(height)).toBe(Math.round(PageSizes.A4[1]));
  });

  test("mention très longue : ne déborde pas, document toujours valide", async () => {
    const target = await PDFDocument.create();
    const paragraphs = Array.from({ length: 80 }, (_, i) =>
      `Paragraphe ${i} : bon de commande non joint, limite de poids atteinte.`
    );

    await appendNoticePage(target, "Annexes incomplètes", paragraphs);

    const reloaded = await PDFDocument.load(await target.save());
    expect(reloaded.getPageCount()).toBe(1);
  });
});
