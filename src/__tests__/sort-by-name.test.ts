/**
 * Tests du tri alphabétique français des listes déroulantes (C-DROPDOWN-ALPHA-SORT).
 */

import { sortByLabelFr } from "../lib/sort-by-name";

describe("sortByLabelFr", () => {
  test("ordre alphabétique simple par clé", () => {
    const out = sortByLabelFr(
      [{ name: "Zoé" }, { name: "Alice" }, { name: "Marc" }],
      (x) => x.name
    );
    expect(out.map((x) => x.name)).toEqual(["Alice", "Marc", "Zoé"]);
  });

  test("accents gérés (localeCompare fr) : É classé comme E, pas après Z", () => {
    const out = sortByLabelFr(
      [{ n: "Zacharie" }, { n: "Élodie" }, { n: "Emma" }, { n: "Adèle" }],
      (x) => x.n
    );
    // Adèle, Élodie/Emma (É≈E), Zacharie — É ne finit PAS après Z.
    expect(out.map((x) => x.n)).toEqual(["Adèle", "Élodie", "Emma", "Zacharie"]);
  });

  test("insensible à la casse", () => {
    const out = sortByLabelFr(
      [{ n: "bernard" }, { n: "Arnaud" }, { n: "camille" }],
      (x) => x.n
    );
    expect(out.map((x) => x.n)).toEqual(["Arnaud", "bernard", "camille"]);
  });

  test("ne mute pas la liste d'entrée", () => {
    const input = [{ name: "B" }, { name: "A" }];
    const out = sortByLabelFr(input, (x) => x.name);
    expect(input.map((x) => x.name)).toEqual(["B", "A"]); // inchangé
    expect(out.map((x) => x.name)).toEqual(["A", "B"]);
  });

  test("label composite comédien : 'prénom nom'", () => {
    const comediens = [
      { prenom: "Marie", nom: "Zola" },
      { prenom: "Adrien", nom: "Bon" },
      { prenom: "adrien", nom: "Alt" },
    ];
    const out = sortByLabelFr(comediens, (c) => `${c.prenom} ${c.nom}`);
    expect(out.map((c) => `${c.prenom} ${c.nom}`)).toEqual([
      "adrien Alt",
      "Adrien Bon",
      "Marie Zola",
    ]);
  });

  test("label agent : 'prénom nom' avec prénom absent → nom seul", () => {
    const agents = [
      { prenom: "Sophie", nom: "Voxa" },
      { prenom: null as string | null, nom: "Artmedia" },
    ];
    const label = (a: { prenom?: string | null; nom: string }) =>
      a.prenom ? `${a.prenom} ${a.nom}` : a.nom;
    const out = sortByLabelFr(agents, label);
    expect(out.map(label)).toEqual(["Artmedia", "Sophie Voxa"]);
  });

  test("liste vide → []", () => {
    expect(sortByLabelFr([], (x: { name: string }) => x.name)).toEqual([]);
  });
});
