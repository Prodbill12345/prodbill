/**
 * C-NOM-FICHIERS-PDF : « {numéro} - {client} - {titre}.pdf ».
 * (Remplace les tests de l'ancien format DEVIS_<numéro>_<objet>.pdf.)
 */

import {
  cleanFilenamePart,
  stripDevisRefPrefix,
  buildPdfBaseName,
  devisPdfFilename,
  facturePdfFilename,
  contentDisposition,
} from "../lib/pdf-filename";

describe("cleanFilenamePart", () => {
  test("guillemets droits → typographiques, ouvrant puis fermant", () => {
    expect(cleanFilenamePart('Netflix "L\'appartement" - Vignetting')).toBe("Netflix “L'appartement” - Vignetting");
    expect(cleanFilenamePart('"Pokemon" et "Splendor"')).toBe("“Pokemon” et “Splendor”");
  });

  test("accents en NFC (forme décomposée recomposée)", () => {
    const decompose = "Fêtes des pères"; // ê et è décomposés
    expect(cleanFilenamePart(decompose)).toBe("Fêtes des pères");
    expect(cleanFilenamePart(decompose)).toHaveLength("Fêtes des pères".length);
  });

  test("caractères interdits retirés : / \\ : * ? < > |", () => {
    expect(cleanFilenamePart("Mix/SD \\ v2: final* ? <ok> | fin")).toBe("MixSD v2 final ok fin");
  });

  test("espaces multiples, retours à la ligne, bords et points finaux", () => {
    expect(cleanFilenamePart("  Spot   radio\n30s  ")).toBe("Spot radio 30s");
    expect(cleanFilenamePart("Rec + Mix...")).toBe("Rec + Mix");
  });

  test("vide / null", () => {
    expect(cleanFilenamePart(null)).toBe("");
    expect(cleanFilenamePart("   ")).toBe("");
  });
});

describe("stripDevisRefPrefix", () => {
  test.each([
    ["D26366 - LA MAISON NOIRE - Helena Rubinstein", "LA MAISON NOIRE - Helena Rubinstein"],
    ["D26365 ✘ - LA MAISON NOIRE - REC", "LA MAISON NOIRE - REC"],
    ["D25722 (2026) - ARTEFACT - TotalEnergies", "ARTEFACT - TotalEnergies"],
    ["MNSTR - Netflix", "MNSTR - Netflix"],
    ["DIOR - 1 Film", "DIOR - 1 Film"],
  ])("%s", (input, expected) => {
    expect(stripDevisRefPrefix(input)).toBe(expected);
  });
});

describe("devisPdfFilename — objet tel que Vanda l'écrit", () => {
  test("exemple de Vanda : D26032", () => {
    expect(
      devisPdfFilename({ numero: "26032", objet: 'MNSTR - Netflix "L\'appartement" - Vignetting', client: { name: "MENUXL" } })
    ).toBe("D26032 - MNSTR - Netflix “L'appartement” - Vignetting.pdf");
  });

  test("objet commençant par son numéro : pas de doublon", () => {
    expect(
      devisPdfFilename({ numero: "26366", objet: "D26366 - LA MAISON NOIRE - Helena Rubinstein", client: { name: "LA MAISON NOIRE" } })
    ).toBe("D26366 - LA MAISON NOIRE - Helena Rubinstein.pdf");
  });

  test("numéro de l'objet faux (coquille) : le vrai numéro l'emporte", () => {
    expect(devisPdfFilename({ numero: "26286", objet: "D26285 - MATTER OF FACT - Piaget", client: null })).toBe(
      "D26286 - MATTER OF FACT - Piaget.pdf"
    );
  });

  test("titre vide → numéro - client", () => {
    expect(devisPdfFilename({ numero: "26032", objet: "", client: { name: "MNSTR" } })).toBe("D26032 - MNSTR.pdf");
    expect(devisPdfFilename({ numero: "26032", objet: "D26032 - ", client: { name: "MNSTR" } })).toBe("D26032 - MNSTR.pdf");
  });
});

describe("longueur", () => {
  const long = "Range Rover - Additif Cutdowns 25s, 20s, 15s, 9s et 6s - Mixage + Sound design + Conformation + Livraisons multiples TV et digital";

  test("titre très long tronqué sur un mot avec « … », numéro intact, ≤ 120 + .pdf", () => {
    const name = devisPdfFilename({ numero: "26361", objet: `WPP PRODUCTION - ${long}`, client: null });
    expect(name.startsWith("D26361 - WPP PRODUCTION - Range Rover")).toBe(true);
    expect(name.endsWith("….pdf")).toBe(true);
    expect(name.length).toBeLessThanOrEqual(124);
  });

  test("objet vide et client démesuré : client tronqué, jamais le numéro", () => {
    const base = buildPdfBaseName({ numero: "F26026", client: "HONDA MOTOR EUROPE LTD ".repeat(8), titre: "" });
    expect(base.startsWith("F26026 - HONDA MOTOR EUROPE")).toBe(true);
    expect(base.length).toBeLessThanOrEqual(120);
  });

  test("objet renseigné : la fiche client n'est pas ajoutée (client final déjà dans l'objet)", () => {
    expect(buildPdfBaseName({ numero: "D26029", client: "MATTER OF FACT", titre: "PIAGET SERIE CRAFT - LOCATION SALLE" })).toBe(
      "D26029 - PIAGET SERIE CRAFT - LOCATION SALLE"
    );
  });
});

describe("facturePdfFilename", () => {
  test("objet figé de la facture prioritaire", () => {
    expect(
      facturePdfFilename({ numero: "26122", objet: "D26307 - ARTEFACT - TotalEnergies - 1 Spot radio", client: { name: "ARTEFACT" }, devis: { objet: "autre" } })
    ).toBe("F26122 - ARTEFACT - TotalEnergies - 1 Spot radio.pdf");
  });

  test("récap (pas d'objet, pas de devis) → numéro - client", () => {
    expect(facturePdfFilename({ numero: "26120", objet: null, client: { name: "ARTEFACT" }, devis: null })).toBe("F26120 - ARTEFACT.pdf");
  });

  test("avoir et brouillon", () => {
    expect(facturePdfFilename({ numero: "AV-26122", client: { name: "ARTEFACT" }, devis: { objet: "D26307 - ARTEFACT - Spot" } })).toBe(
      "AV-26122 - ARTEFACT - Spot.pdf"
    );
    expect(facturePdfFilename({ numero: null, client: { name: "ARTEFACT" }, devis: null })).toBe("Brouillon - ARTEFACT.pdf");
  });

  test("Factur-X suffixé pour ne pas écraser le PDF simple", () => {
    expect(facturePdfFilename({ numero: "26122", objet: "ARTEFACT - Spot", client: null }, { suffix: "Factur-X" })).toBe(
      "F26122 - ARTEFACT - Spot - Factur-X.pdf"
    );
  });
});

describe("contentDisposition", () => {
  test("filename* en UTF-8 + repli ASCII sans guillemet ni accent", () => {
    const h = contentDisposition("D26032 - MNSTR - Netflix “L'appartement” - Fêtes.pdf");
    expect(h).toBe(
      "attachment; filename=\"D26032 - MNSTR - Netflix 'L'appartement' - Fetes.pdf\"; " +
        "filename*=UTF-8''D26032%20-%20MNSTR%20-%20Netflix%20%E2%80%9CL%27appartement%E2%80%9D%20-%20F%C3%AAtes.pdf"
    );
  });

  test("valeur d'en-tête HTTP valide (aucun caractère hors Latin-1)", () => {
    const h = contentDisposition("F26122 - Réalisation “Été” ✘ ….pdf");
    expect(() => new Headers({ "Content-Disposition": h })).not.toThrow();
    expect(decodeURIComponent(h.split("filename*=UTF-8''")[1])).toBe("F26122 - Réalisation “Été” ✘ ….pdf");
  });
});
