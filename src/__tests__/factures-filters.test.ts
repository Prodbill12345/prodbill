import {
  filterFactures,
  filtersToParams,
  paramsToFilters,
  hasActiveFilters,
  type FactureFilterable,
  type FacturesFilters,
} from "../lib/factures-filters";

function facture(over: Partial<FactureFilterable> = {}): FactureFilterable {
  return {
    numero: "FAC-26-0001",
    numeroBdc: null,
    type: "SOLDE",
    statut: "EMISE",
    dateEmission: new Date("2026-03-15T10:00:00.000Z"),
    dateEcheance: new Date("2026-04-30T00:00:00.000Z"),
    dateReglement: null,
    totalTtc: 5000,
    client: { name: "ACME" },
    devis: { numero: "26001", objet: "Spot TV" },
    ...over,
  };
}

describe("filterFactures — recherche libre (q)", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "FAC-A", client: { name: "K-LINE" }, devis: { numero: "26089", objet: "K-LINE" } }),
    facture({ numero: "FAC-B", client: { name: "Lidl" }, devis: { numero: "26100", objet: "Spot Studio" } }),
    facture({ numero: "FAC-C", client: { name: "Maxence" }, devis: null }),
  ];

  test("vide → toutes", () => {
    expect(filterFactures(list, {})).toHaveLength(3);
    expect(filterFactures(list, { q: "" })).toHaveLength(3);
  });

  test("match numéro facture", () => {
    expect(filterFactures(list, { q: "FAC-A" }).map((f) => f.numero)).toEqual(["FAC-A"]);
  });

  test("match client", () => {
    expect(filterFactures(list, { q: "lidl" }).map((f) => f.numero)).toEqual(["FAC-B"]);
  });

  test("match numéro devis lié", () => {
    expect(filterFactures(list, { q: "26089" }).map((f) => f.numero)).toEqual(["FAC-A"]);
  });

  test("match objet du devis lié", () => {
    expect(filterFactures(list, { q: "studio" }).map((f) => f.numero)).toEqual(["FAC-B"]);
  });

  test("facture sans devis lié → match seulement sur numéro + client", () => {
    expect(filterFactures(list, { q: "maxence" }).map((f) => f.numero)).toEqual(["FAC-C"]);
  });

  test("case-insensitive + substring", () => {
    expect(filterFactures(list, { q: "K-LINE" })).toHaveLength(1);
    expect(filterFactures(list, { q: "lin" })).toHaveLength(1);
  });

  test("aucun match", () => {
    expect(filterFactures(list, { q: "zzzznope" })).toHaveLength(0);
  });
});

describe("filterFactures — filtre statut", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "1", statut: "BROUILLON" }),
    facture({ numero: "2", statut: "EMISE" }),
    facture({ numero: "3", statut: "PAYEE_PARTIEL" }),
    facture({ numero: "4", statut: "PAYEE" }),
    facture({ numero: "5", statut: "EN_RETARD" }),
    facture({ numero: "6", statut: "ANNULEE" }),
  ];

  test("statut PAYEE_PARTIEL → seulement PAYEE_PARTIEL", () => {
    expect(filterFactures(list, { statut: "PAYEE_PARTIEL" }).map((f) => f.numero)).toEqual(["3"]);
  });

  test("statut ANNULEE", () => {
    expect(filterFactures(list, { statut: "ANNULEE" }).map((f) => f.numero)).toEqual(["6"]);
  });

  test("vide → toutes (6)", () => {
    expect(filterFactures(list, { statut: "" })).toHaveLength(6);
  });
});

describe("filterFactures — filtre type (ACOMPTE / SOLDE / AVOIR)", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "AC1", type: "ACOMPTE" }),
    facture({ numero: "AC2", type: "ACOMPTE" }),
    facture({ numero: "SO",  type: "SOLDE" }),
    facture({ numero: "AV",  type: "AVOIR", statut: "ANNULEE" }),
  ];

  test("type=ACOMPTE → seulement ACOMPTE", () => {
    expect(filterFactures(list, { type: "ACOMPTE" }).map((f) => f.numero))
      .toEqual(["AC1", "AC2"]);
  });

  test("type=AVOIR + statut=ANNULEE combinés", () => {
    expect(
      filterFactures(list, { type: "AVOIR", statut: "ANNULEE" }).map((f) => f.numero)
    ).toEqual(["AV"]);
  });
});

describe("filterFactures — filtre année", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "A", dateEmission: new Date("2025-12-30Z") }),
    facture({ numero: "B", dateEmission: new Date("2026-01-05Z") }),
    facture({ numero: "C", dateEmission: new Date("2026-11-30Z") }),
    facture({ numero: "D", dateEmission: null }),
  ];

  test("annee 2026", () => {
    expect(filterFactures(list, { annee: 2026 }).map((f) => f.numero)).toEqual(["B", "C"]);
  });

  test("annee 2025", () => {
    expect(filterFactures(list, { annee: 2025 }).map((f) => f.numero)).toEqual(["A"]);
  });

  test("facture sans dateEmission → exclu", () => {
    expect(filterFactures(list, { annee: 2026 }).map((f) => f.numero)).not.toContain("D");
  });
});

describe("filterFactures — date émission range", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "M1", dateEmission: new Date("2026-03-01Z") }),
    facture({ numero: "M2", dateEmission: new Date("2026-03-31T23:59Z") }),
    facture({ numero: "A1", dateEmission: new Date("2026-04-01Z") }),
  ];

  test("range mars 2026", () => {
    expect(
      filterFactures(list, {
        dateEmissionFrom: "2026-03-01",
        dateEmissionTo: "2026-03-31",
      }).map((f) => f.numero)
    ).toEqual(["M1", "M2"]);
  });
});

describe("filterFactures — date échéance range", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "E1", dateEcheance: new Date("2026-04-15Z") }),
    facture({ numero: "E2", dateEcheance: new Date("2026-05-15Z") }),
    facture({ numero: "E3", dateEcheance: new Date("2026-06-15Z") }),
    facture({ numero: "NULL", dateEcheance: null }),
  ];

  test("from seul", () => {
    expect(
      filterFactures(list, { dateEcheanceFrom: "2026-05-01" }).map((f) => f.numero)
    ).toEqual(["E2", "E3"]);
  });

  test("range complet", () => {
    expect(
      filterFactures(list, {
        dateEcheanceFrom: "2026-05-01",
        dateEcheanceTo: "2026-05-31",
      }).map((f) => f.numero)
    ).toEqual(["E2"]);
  });

  test("dateEcheance null → exclu du filtre", () => {
    expect(
      filterFactures(list, { dateEcheanceFrom: "2026-01-01" }).map((f) => f.numero)
    ).not.toContain("NULL");
  });
});

describe("filterFactures — date règlement range", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "R1", dateReglement: new Date("2026-03-20Z") }),
    facture({ numero: "R2", dateReglement: new Date("2026-04-10Z") }),
    facture({ numero: "NULL", dateReglement: null }),
  ];

  test("range", () => {
    expect(
      filterFactures(list, {
        dateReglementFrom: "2026-04-01",
        dateReglementTo: "2026-04-30",
      }).map((f) => f.numero)
    ).toEqual(["R2"]);
  });

  test("dateReglement null → exclu", () => {
    expect(
      filterFactures(list, { dateReglementFrom: "2026-01-01" }).map((f) => f.numero)
    ).not.toContain("NULL");
  });
});

describe("filterFactures — plage TTC", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "P", totalTtc: 500 }),
    facture({ numero: "M", totalTtc: 5000 }),
    facture({ numero: "G", totalTtc: 50000 }),
  ];

  test("min seul", () => {
    expect(filterFactures(list, { totalTtcMin: 5000 }).map((f) => f.numero))
      .toEqual(["M", "G"]);
  });
  test("max seul", () => {
    expect(filterFactures(list, { totalTtcMax: 5000 }).map((f) => f.numero))
      .toEqual(["P", "M"]);
  });
  test("min + max", () => {
    expect(
      filterFactures(list, { totalTtcMin: 1000, totalTtcMax: 10000 }).map((f) => f.numero)
    ).toEqual(["M"]);
  });
});

describe("filterFactures — filtre N° BDC", () => {
  const list: FactureFilterable[] = [
    facture({ numero: "1", numeroBdc: "BDC-25-0042" }),
    facture({ numero: "2", numeroBdc: "BDC-26-0001" }),
    facture({ numero: "3", numeroBdc: null }),
  ];

  test("substring case-insensitive", () => {
    expect(filterFactures(list, { bdcNumero: "bdc-25" }).map((f) => f.numero))
      .toEqual(["1"]);
  });

  test("facture sans BDC → exclu si filtre actif", () => {
    expect(filterFactures(list, { bdcNumero: "BDC" }).map((f) => f.numero))
      .toEqual(["1", "2"]);
  });
});

describe("filterFactures — combinaisons", () => {
  const list: FactureFilterable[] = [
    facture({
      numero: "F1",
      type: "ACOMPTE",
      statut: "EMISE",
      totalTtc: 5000,
      dateEcheance: new Date("2026-04-30Z"),
      client: { name: "ACME" },
    }),
    facture({
      numero: "F2",
      type: "SOLDE",
      statut: "PAYEE",
      totalTtc: 5000,
      dateEcheance: new Date("2026-04-30Z"),
      client: { name: "ACME" },
    }),
    facture({
      numero: "F3",
      type: "ACOMPTE",
      statut: "EMISE",
      totalTtc: 100,
      dateEcheance: new Date("2026-04-30Z"),
      client: { name: "ACME" },
    }),
  ];

  test("type + statut + dateEcheance range + TTC range", () => {
    expect(
      filterFactures(list, {
        type: "ACOMPTE",
        statut: "EMISE",
        dateEcheanceFrom: "2026-04-01",
        dateEcheanceTo: "2026-05-31",
        totalTtcMin: 1000,
      }).map((f) => f.numero)
    ).toEqual(["F1"]);
  });

  test("filtres contradictoires → array vide", () => {
    expect(
      filterFactures(list, { type: "AVOIR", totalTtcMin: 9_999_999 })
    ).toHaveLength(0);
  });
});

describe("filterFactures — effacement", () => {
  const list = [facture({ numero: "1" }), facture({ numero: "2" })];

  test("filters={} → toutes", () => {
    expect(filterFactures(list, {})).toHaveLength(2);
  });
});

describe("filtersToParams / paramsToFilters factures", () => {
  test("round-trip complet (3 date ranges + type + statut)", () => {
    const f: FacturesFilters = {
      q: "k-line",
      statut: "EMISE",
      type: "ACOMPTE",
      annee: 2026,
      dateEmissionFrom: "2026-01-01",
      dateEmissionTo: "2026-12-31",
      dateEcheanceFrom: "2026-02-01",
      dateEcheanceTo: "2027-01-31",
      dateReglementFrom: "2026-03-01",
      dateReglementTo: "2026-12-31",
      totalTtcMin: 1000,
      totalTtcMax: 100000,
      bdcNumero: "BDC-26",
    };
    const params = filtersToParams(f);
    const back = paramsToFilters(params);
    expect(back).toEqual(f);
  });

  test("vides omis", () => {
    const params = filtersToParams({ q: "", statut: "", type: "" });
    expect(params.toString()).toBe("");
  });

  test("paramsToFilters ignore les valeurs mal formées", () => {
    const p = new URLSearchParams("annee=abc&dateEcheanceFrom=2026/04/01&totalTtcMin=NaN");
    const f = paramsToFilters(p);
    expect(f.annee).toBeUndefined();
    expect(f.dateEcheanceFrom).toBeUndefined();
    expect(f.totalTtcMin).toBeUndefined();
  });

  test("hasActiveFilters", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ type: "ACOMPTE" })).toBe(true);
    expect(hasActiveFilters({ dateReglementFrom: "2026-01-01" })).toBe(true);
  });
});
