import {
  filterDevis,
  filtersToParams,
  paramsToFilters,
  hasActiveFilters,
  type DevisFilterable,
  type DevisFilters,
} from "../lib/devis-filters";

// Helper : crée un devis test
function devis(over: Partial<DevisFilterable> = {}): DevisFilterable {
  return {
    numero: "26001",
    objet: "Spot Pub TV",
    client: { name: "ACME" },
    statut: "ACCEPTE",
    annee: null,
    dateEmission: new Date("2026-03-15T10:00:00.000Z"),
    totalTtc: 5000,
    bdc: null,
    ...over,
  };
}

describe("filterDevis — recherche libre (q)", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "26089", objet: "K-LINE", client: { name: "K-LINE" } }),
    devis({ numero: "26100", objet: "Spot Studio", client: { name: "Lidl" } }),
    devis({ numero: null, objet: "Brouillon Cagarro", client: { name: "Maxence" } }),
  ];

  test("vide → tous les devis", () => {
    expect(filterDevis(list, {})).toHaveLength(3);
    expect(filterDevis(list, { q: "" })).toHaveLength(3);
    expect(filterDevis(list, { q: "   " })).toHaveLength(3);
  });

  test("match numéro", () => {
    expect(filterDevis(list, { q: "26089" })).toHaveLength(1);
    expect(filterDevis(list, { q: "26089" })[0].numero).toBe("26089");
  });

  test("match client", () => {
    expect(filterDevis(list, { q: "lidl" }).map((d) => d.numero)).toEqual(["26100"]);
  });

  test("match objet", () => {
    expect(filterDevis(list, { q: "Cagarro" })).toHaveLength(1);
  });

  test("case-insensitive", () => {
    expect(filterDevis(list, { q: "K-LINE" })).toHaveLength(1);
    expect(filterDevis(list, { q: "k-line" })).toHaveLength(1);
    expect(filterDevis(list, { q: "k-LiNe" })).toHaveLength(1);
  });

  test("substring", () => {
    expect(filterDevis(list, { q: "lin" })).toHaveLength(1); // matche "K-LINE"
    expect(filterDevis(list, { q: "rouill" })).toHaveLength(1); // matche "Brouillon"
  });

  test("aucun match → array vide", () => {
    expect(filterDevis(list, { q: "zzzznonexistent" })).toHaveLength(0);
  });
});

describe("filterDevis — filtre statut", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "1", statut: "BROUILLON" }),
    devis({ numero: "2", statut: "ENVOYE" }),
    devis({ numero: "3", statut: "ACCEPTE" }),
    devis({ numero: "4", statut: "ACCEPTE" }),
    devis({ numero: "5", statut: "REFUSE" }),
  ];

  test("statut ACCEPTE → seulement ACCEPTE", () => {
    const out = filterDevis(list, { statut: "ACCEPTE" });
    expect(out).toHaveLength(2);
    expect(out.every((d) => d.statut === "ACCEPTE")).toBe(true);
  });

  test('statut "" (vide) → tous', () => {
    expect(filterDevis(list, { statut: "" })).toHaveLength(5);
  });
});

describe("filterDevis — filtre année (avec fallback dateEmission)", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "A", annee: 2025, dateEmission: new Date("2026-01-10Z") }),
    devis({ numero: "B", annee: null, dateEmission: new Date("2026-05-11Z") }),
    devis({ numero: "C", annee: null, dateEmission: new Date("2025-12-30Z") }),
    devis({ numero: "D", annee: null, dateEmission: null }),
  ];

  test("annee saisie prioritaire (A → 2025, pas 2026)", () => {
    expect(filterDevis(list, { annee: 2025 }).map((d) => d.numero)).toEqual(["A", "C"]);
  });

  test("annee null → fallback year(dateEmission)", () => {
    expect(filterDevis(list, { annee: 2026 }).map((d) => d.numero)).toEqual(["B"]);
  });

  test("devis sans annee ET sans dateEmission → exclu", () => {
    expect(filterDevis(list, { annee: 2025 }).map((d) => d.numero)).not.toContain("D");
  });
});

describe("filterDevis — plage dateEmission", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "J1", dateEmission: new Date("2026-01-15Z") }),
    devis({ numero: "M1", dateEmission: new Date("2026-03-10Z") }),
    devis({ numero: "M2", dateEmission: new Date("2026-03-31T23:59Z") }),
    devis({ numero: "A1", dateEmission: new Date("2026-04-01Z") }),
    devis({ numero: "BROUILLON", dateEmission: null }),
  ];

  test("from seul (inclusif)", () => {
    expect(filterDevis(list, { dateEmissionFrom: "2026-03-10" }).map((d) => d.numero))
      .toEqual(["M1", "M2", "A1"]);
  });

  test("to seul (inclusif jusqu'à 23:59:59.999)", () => {
    expect(filterDevis(list, { dateEmissionTo: "2026-03-31" }).map((d) => d.numero))
      .toEqual(["J1", "M1", "M2"]);
  });

  test("range from + to", () => {
    expect(
      filterDevis(list, {
        dateEmissionFrom: "2026-03-01",
        dateEmissionTo: "2026-03-31",
      }).map((d) => d.numero)
    ).toEqual(["M1", "M2"]);
  });

  test("brouillon (dateEmission null) exclu de tout filtre date", () => {
    expect(
      filterDevis(list, { dateEmissionFrom: "2026-01-01" }).map((d) => d.numero)
    ).not.toContain("BROUILLON");
  });
});

describe("filterDevis — plage totalTtc", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "P", totalTtc: 500 }),
    devis({ numero: "M", totalTtc: 5000 }),
    devis({ numero: "G", totalTtc: 50000 }),
    devis({ numero: "XL", totalTtc: 500000 }),
  ];

  test("min seul", () => {
    expect(filterDevis(list, { totalTtcMin: 5000 }).map((d) => d.numero))
      .toEqual(["M", "G", "XL"]);
  });

  test("max seul", () => {
    expect(filterDevis(list, { totalTtcMax: 5000 }).map((d) => d.numero))
      .toEqual(["P", "M"]);
  });

  test("min + max", () => {
    expect(
      filterDevis(list, { totalTtcMin: 1000, totalTtcMax: 100000 }).map((d) => d.numero)
    ).toEqual(["M", "G"]);
  });

  test("min = max (égalité incluse)", () => {
    expect(
      filterDevis(list, { totalTtcMin: 5000, totalTtcMax: 5000 }).map((d) => d.numero)
    ).toEqual(["M"]);
  });
});

describe("filterDevis — filtre N° BDC (substring)", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "1", bdc: { numero: "BDC-25-0042" } }),
    devis({ numero: "2", bdc: { numero: "BDC-26-0001" } }),
    devis({ numero: "3", bdc: null }),
    devis({ numero: "4", bdc: { numero: "PO-2026-XYZ" } }),
  ];

  test("match exact", () => {
    expect(filterDevis(list, { bdcNumero: "BDC-25-0042" }).map((d) => d.numero))
      .toEqual(["1"]);
  });

  test("substring case-insensitive", () => {
    expect(filterDevis(list, { bdcNumero: "bdc-26" }).map((d) => d.numero))
      .toEqual(["2"]);
  });

  test("devis sans BDC → exclu si filtre actif", () => {
    expect(filterDevis(list, { bdcNumero: "BDC" }).map((d) => d.numero))
      .toEqual(["1", "2"]);
  });
});

describe("filterDevis — combinaison plusieurs filtres", () => {
  const list: DevisFilterable[] = [
    devis({ numero: "26050", statut: "ACCEPTE", totalTtc: 5000, dateEmission: new Date("2026-03-15Z"), client: { name: "ACME" } }),
    devis({ numero: "26051", statut: "REFUSE",  totalTtc: 5000, dateEmission: new Date("2026-03-20Z"), client: { name: "ACME" } }),
    devis({ numero: "26052", statut: "ACCEPTE", totalTtc:  500, dateEmission: new Date("2026-03-25Z"), client: { name: "Lidl" } }),
    devis({ numero: "26053", statut: "ACCEPTE", totalTtc: 5000, dateEmission: new Date("2025-12-15Z"), client: { name: "ACME" } }),
  ];

  test("q + statut + ttc + date range simultanés", () => {
    const out = filterDevis(list, {
      q: "acme",
      statut: "ACCEPTE",
      totalTtcMin: 1000,
      dateEmissionFrom: "2026-01-01",
    });
    expect(out.map((d) => d.numero)).toEqual(["26050"]);
  });

  test("filtres contradictoires → array vide", () => {
    expect(
      filterDevis(list, { statut: "BROUILLON", totalTtcMin: 1000000 })
    ).toHaveLength(0);
  });
});

describe("filterDevis — effacement / aucun filtre", () => {
  const list = [devis({ numero: "1" }), devis({ numero: "2" })];

  test("filters={} → tous", () => {
    expect(filterDevis(list, {})).toHaveLength(2);
  });

  test("filters tous undefined → tous", () => {
    expect(
      filterDevis(list, {
        q: undefined,
        statut: undefined,
        annee: undefined,
        totalTtcMin: undefined,
        totalTtcMax: undefined,
      })
    ).toHaveLength(2);
  });
});

describe("filtersToParams / paramsToFilters", () => {
  test("round-trip filtres complets", () => {
    const f: DevisFilters = {
      q: "k-line",
      statut: "ACCEPTE",
      annee: 2026,
      dateEmissionFrom: "2026-01-01",
      dateEmissionTo: "2026-12-31",
      totalTtcMin: 1000,
      totalTtcMax: 100000,
      bdcNumero: "BDC-26",
    };
    const params = filtersToParams(f);
    const back = paramsToFilters(params);
    expect(back).toEqual(f);
  });

  test("vides omis de l'URL", () => {
    const params = filtersToParams({ q: "  ", statut: "", annee: undefined });
    expect(params.toString()).toBe("");
  });

  test("paramsToFilters ignore les valeurs mal formées", () => {
    const p = new URLSearchParams("annee=abc&dateEmissionFrom=2026/01/01&totalTtcMin=NaN");
    const f = paramsToFilters(p);
    expect(f.annee).toBeUndefined();
    expect(f.dateEmissionFrom).toBeUndefined();
    expect(f.totalTtcMin).toBeUndefined();
  });

  test("hasActiveFilters", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ q: "" })).toBe(false);
    expect(hasActiveFilters({ q: "k" })).toBe(true);
    expect(hasActiveFilters({ totalTtcMin: 0 })).toBe(true);  // 0 légitime
    expect(hasActiveFilters({ statut: "ACCEPTE" })).toBe(true);
  });
});
