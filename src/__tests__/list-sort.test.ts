import {
  sortBy,
  sortToParams,
  paramsToSort,
  nextSortState,
  type SortState,
  type SortAccessor,
} from "../lib/list-sort";

interface Item {
  id: string;
  name: string;
  age: number | null;
  joined: Date | null;
}

const ACCESSORS: Record<"name" | "age" | "joined", SortAccessor<Item>> = {
  name: (i) => i.name,
  age: (i) => i.age,
  joined: (i) => i.joined,
};
const DEFAULT_SORT: SortState<"name" | "age" | "joined"> = { key: "joined", order: "desc" };

const ITEMS: Item[] = [
  { id: "1", name: "Charlie", age: 30, joined: new Date("2026-01-15Z") },
  { id: "2", name: "alice",   age: 25, joined: new Date("2026-03-10Z") },
  { id: "3", name: "Bob",     age: null, joined: null },
  { id: "4", name: "Diana",   age: 28, joined: new Date("2025-12-01Z") },
];

describe("sortBy", () => {
  test("string ASC (insensible casse via localeCompare)", () => {
    const out = sortBy(ITEMS, { key: "name", order: "asc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.name)).toEqual(["alice", "Bob", "Charlie", "Diana"]);
  });

  test("string DESC", () => {
    const out = sortBy(ITEMS, { key: "name", order: "desc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.name)).toEqual(["Diana", "Charlie", "Bob", "alice"]);
  });

  test("number ASC (null en dernier)", () => {
    const out = sortBy(ITEMS, { key: "age", order: "asc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.id)).toEqual(["2", "4", "1", "3"]); // 25, 28, 30, null
  });

  test("number DESC (null toujours en dernier — convention prévisible)", () => {
    const out = sortBy(ITEMS, { key: "age", order: "desc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.id)).toEqual(["1", "4", "2", "3"]); // 30, 28, 25, null
  });

  test("Date ASC (null en dernier)", () => {
    const out = sortBy(ITEMS, { key: "joined", order: "asc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.id)).toEqual(["4", "1", "2", "3"]);
  });

  test("Date DESC (null en dernier)", () => {
    const out = sortBy(ITEMS, { key: "joined", order: "desc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.id)).toEqual(["2", "1", "4", "3"]);
  });

  test("sort null → applique le default", () => {
    const out = sortBy(ITEMS, null, ACCESSORS, DEFAULT_SORT);
    // default = joined desc
    expect(out.map((i) => i.id)).toEqual(["2", "1", "4", "3"]);
  });

  test("ne mute pas la liste d'entrée", () => {
    const copy = [...ITEMS];
    sortBy(ITEMS, { key: "name", order: "asc" }, ACCESSORS, DEFAULT_SORT);
    expect(ITEMS.map((i) => i.id)).toEqual(copy.map((i) => i.id));
  });

  test("numero alphanum avec localeCompare numeric : 26010 < 26100", () => {
    const items = [
      { id: "a", name: "DEV-2026-26100", age: 0, joined: null },
      { id: "b", name: "DEV-2026-26010", age: 0, joined: null },
      { id: "c", name: "DEV-2026-26089", age: 0, joined: null },
    ];
    const out = sortBy(items, { key: "name", order: "asc" }, ACCESSORS, DEFAULT_SORT);
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("nextSortState (cycle ASC → DESC → reset)", () => {
  test("null + click → asc sur cette colonne", () => {
    expect(nextSortState(null, "totalTtc")).toEqual({ key: "totalTtc", order: "asc" });
  });

  test("{X, asc} + re-click X → {X, desc}", () => {
    expect(nextSortState({ key: "totalTtc", order: "asc" }, "totalTtc"))
      .toEqual({ key: "totalTtc", order: "desc" });
  });

  test("{X, desc} + re-click X → null (reset)", () => {
    expect(nextSortState({ key: "totalTtc", order: "desc" }, "totalTtc"))
      .toBeNull();
  });

  test("{X, *} + click Y → {Y, asc}", () => {
    expect(nextSortState({ key: "totalTtc", order: "desc" }, "client" as never))
      .toEqual({ key: "client", order: "asc" });
  });
});

describe("sortToParams / paramsToSort", () => {
  const VALID = ["name", "age"] as const;

  test("round-trip", () => {
    const state: SortState<"name"> = { key: "name", order: "asc" };
    const back = paramsToSort(sortToParams(state), VALID);
    expect(back).toEqual(state);
  });

  test("null → params vides", () => {
    expect(sortToParams(null).toString()).toBe("");
  });

  test("paramsToSort retourne null si clé non whitelistée", () => {
    const p = new URLSearchParams("sort=evil&order=asc");
    expect(paramsToSort(p, VALID)).toBeNull();
  });

  test("paramsToSort retourne null si order invalide", () => {
    const p = new URLSearchParams("sort=name&order=upside-down");
    expect(paramsToSort(p, VALID)).toBeNull();
  });

  test("paramsToSort retourne null si paramètres manquants", () => {
    expect(paramsToSort(new URLSearchParams(""), VALID)).toBeNull();
    expect(paramsToSort(new URLSearchParams("sort=name"), VALID)).toBeNull();
    expect(paramsToSort(new URLSearchParams("order=asc"), VALID)).toBeNull();
  });
});
