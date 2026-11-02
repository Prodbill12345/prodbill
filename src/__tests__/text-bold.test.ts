/**
 * C-DESCRIPTION-GRAS : format `**gras**` de la description du projet.
 */

import { parseBold, stripBold, hasBold, toggleBold, applyBoldEdit } from "../lib/text-bold";

describe("parseBold", () => {
  test("texte sans gras → un seul segment normal", () => {
    expect(parseBold("Spot radio 30s")).toEqual([{ text: "Spot radio 30s", bold: false }]);
  });

  test("passages en gras au milieu, au début, à la fin", () => {
    expect(parseBold("**Casting** 1 comédienne, diffusion **France 1 an**")).toEqual([
      { text: "Casting", bold: true },
      { text: " 1 comédienne, diffusion ", bold: false },
      { text: "France 1 an", bold: true },
    ]);
  });

  test("gras sur plusieurs lignes", () => {
    expect(parseBold("a **b\nc** d")).toEqual([
      { text: "a ", bold: false },
      { text: "b\nc", bold: true },
      { text: " d", bold: false },
    ]);
  });

  test("marqueur non fermé, vide ou étoile isolée → texte tel quel", () => {
    expect(parseBold("prix **à confirmer")).toEqual([{ text: "prix **à confirmer", bold: false }]);
    expect(parseBold("****")).toEqual([{ text: "****", bold: false }]);
    expect(parseBold("note * importante")).toEqual([{ text: "note * importante", bold: false }]);
  });

  test("aucun HTML interprété : balises gardées comme texte", () => {
    expect(parseBold("<b>x</b> **y**")).toEqual([
      { text: "<b>x</b> ", bold: false },
      { text: "y", bold: true },
    ]);
  });

  test("texte vide", () => {
    expect(parseBold("")).toEqual([]);
  });
});

describe("stripBold / hasBold", () => {
  test("texte brut pour le XML : marqueurs retirés, rien d'autre", () => {
    expect(stripBold("**Casting** et **mix**, note * libre")).toBe("Casting et mix, note * libre");
    expect(stripBold("prix **à confirmer")).toBe("prix **à confirmer");
  });

  test("hasBold", () => {
    expect(hasBold("a **b**")).toBe(true);
    expect(hasBold("a ** b")).toBe(false);
  });
});

describe("toggleBold", () => {
  const run = (value: string, start: number, end: number) => {
    const edit = toggleBold(value, start, end);
    return { value: applyBoldEdit(value, edit), sel: [edit.selectionStart, edit.selectionEnd] };
  };

  test("met la sélection en gras et garde le mot sélectionné", () => {
    const r = run("Casting voix", 0, 7);
    expect(r.value).toBe("**Casting** voix");
    expect(r.value.slice(r.sel[0], r.sel[1])).toBe("Casting");
  });

  test("espaces en bord de sélection laissés hors du gras (double-clic)", () => {
    expect(run("un mot ici", 3, 7).value).toBe("un **mot** ici");
  });

  test("retire le gras si la sélection est déjà entourée", () => {
    const r = run("un **mot** ici", 5, 8);
    expect(r.value).toBe("un mot ici");
    expect(r.value.slice(r.sel[0], r.sel[1])).toBe("mot");
  });

  test("retire le gras si la sélection inclut ses marqueurs", () => {
    expect(run("un **mot** ici", 3, 10).value).toBe("un mot ici");
  });

  test("sans sélection : insère **** avec le curseur au milieu", () => {
    const r = run("abc", 3, 3);
    expect(r.value).toBe("abc****");
    expect(r.sel).toEqual([5, 5]);
  });

  test("sélection d'espaces seulement : aucun changement", () => {
    expect(run("a   b", 1, 4).value).toBe("a   b");
  });

  test("aller-retour : gras puis retrait redonne le texte d'origine", () => {
    const first = toggleBold("Diffusion France", 10, 16);
    const bolded = applyBoldEdit("Diffusion France", first);
    const back = applyBoldEdit(bolded, toggleBold(bolded, first.selectionStart, first.selectionEnd));
    expect(back).toBe("Diffusion France");
  });
});
