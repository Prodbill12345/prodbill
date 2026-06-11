/**
 * Tests du helper buildDuplicatedDevisData (ticket #93).
 *
 * Couvre :
 *   - Reset cycle de vie : numero, statut, dateEmission, pdfUrl, bdcClient*
 *   - Traçabilité : devisSourceId pointe vers la source
 *   - Champs métier copiés fidèlement (objet, taux, période, lignes…)
 *   - Garde-fou multi-tenant : refus si source.companyId != current company
 *   - Sections + lignes : structure préservée, deep copy (les ids seront
 *     régénérés par Prisma, on ne les copie pas)
 */

import { buildDuplicatedDevisData } from "../lib/devis-duplicate";
import type { DevisSourceForDuplicate } from "../lib/devis-duplicate";

function makeSource(
  overrides: Partial<DevisSourceForDuplicate> = {}
): DevisSourceForDuplicate {
  const base: DevisSourceForDuplicate = {
    id: "src-1",
    companyId: "comp-A",
    clientId: "cli-1",
    numero: "26-0042",
    objet: "Spot TV Marque X",
    description: "Description du projet",
    statut: "ACCEPTE",
    tauxCsComedien: 0.57,
    tauxCsTech: 0.65,
    tauxFg: 0.05,
    tauxMarge: 0.15,
    sousTotal: 1000,
    csComedien: 0,
    csTechniciens: 0,
    baseMarge: 1000,
    fraisGeneraux: 50,
    marge: 150,
    totalHt: 1200,
    remise: 100,
    coproduction: 0,
    totalApresRemise: 1100,
    tauxTva: 20,
    tvaMention: null,
    tva: 220,
    totalTtc: 1320,
    dateEmission: new Date("2026-05-01"),
    dateValidite: new Date("2026-06-01"),
    dateSeance: new Date("2026-05-15"),
    notes: "Notes internes",
    pdfUrl: "https://blob.vercel-storage.com/devis-26-0042.pdf",
    bdcClientUrl: "https://blob.vercel-storage.com/bdc-client.pdf",
    bdcClientFilename: "BDC-client.pdf",
    bdcClientUploadedAt: new Date("2026-05-10"),
    periodeExploitationDebut: new Date("2026-06-01"),
    periodeExploitationFin: new Date("2027-05-31"),
    periodeExploitationLibelle: "Web Global + TV France 1 an",
    nomProjet: "Campagne TV Été 2026",
    refDevis: "DEV-2026-001",
    annee: 2026,
    tauxPipe: 80,
    createdAt: new Date("2026-04-15"),
    updatedAt: new Date("2026-05-01"),
    createdById: "user-original",
    devisSourceId: null,
    sections: [
      {
        id: "sec-1",
        companyId: "comp-A",
        devisId: "src-1",
        titre: "Production",
        ordre: 0,
        lignes: [
          {
            id: "lig-1",
            sectionId: "sec-1",
            companyId: "comp-A",
            libelle: "Réalisation",
            tag: "STUDIO",
            quantite: 1,
            prixUnit: 600,
            total: 600,
            tauxIndexation: 0,
            comedienId: null,
            agentId: null,
            paiementComedien: false,
            horsMarge: false,
            ordre: 0,
          },
          {
            id: "lig-2",
            sectionId: "sec-1",
            companyId: "comp-A",
            libelle: "Musique composition",
            tag: "MUSIQUE",
            quantite: 1,
            prixUnit: 400,
            total: 400,
            tauxIndexation: 0,
            comedienId: null,
            agentId: null,
            paiementComedien: false,
            horsMarge: true,
            ordre: 1,
          },
        ],
      },
    ],
    ...overrides,
  };
  return base;
}

const CTX = { currentUserId: "user-X", currentCompanyId: "comp-A" };

describe("buildDuplicatedDevisData — ticket #93", () => {
  test("reset cycle de vie : numero, statut, dateEmission, pdfUrl, bdcClient*", () => {
    const data = buildDuplicatedDevisData(makeSource(), CTX);

    expect(data.numero).toBeNull();
    expect(data.statut).toBe("BROUILLON");
    expect(data.dateEmission).toBeNull();
    expect(data.pdfUrl).toBeNull();
    expect(data.bdcClientUrl).toBeNull();
    expect(data.bdcClientFilename).toBeNull();
    expect(data.bdcClientUploadedAt).toBeNull();
  });

  test("traçabilité : devisSource.connect pointe vers la source", () => {
    const data = buildDuplicatedDevisData(makeSource(), CTX);
    expect(data.devisSource).toEqual({ connect: { id: "src-1" } });
  });

  test("multi-tenant : createdById et company.connect = current user", () => {
    const data = buildDuplicatedDevisData(makeSource(), CTX);
    expect(data.createdById).toBe("user-X");
    expect(data.company).toEqual({ connect: { id: "comp-A" } });
  });

  test("garde-fou : refus si source.companyId !== currentCompanyId", () => {
    const sourceOtherCompany = makeSource({ companyId: "comp-B" });
    expect(() => buildDuplicatedDevisData(sourceOtherCompany, CTX)).toThrow(
      /autre company/i
    );
  });

  test("champs métier copiés : objet, description, taux, période, notes", () => {
    const source = makeSource();
    const data = buildDuplicatedDevisData(source, CTX);

    expect(data.objet).toBe(source.objet);
    expect(data.description).toBe(source.description);
    expect(data.tauxCsComedien).toBe(source.tauxCsComedien);
    expect(data.tauxCsTech).toBe(source.tauxCsTech);
    expect(data.tauxFg).toBe(source.tauxFg);
    expect(data.tauxMarge).toBe(source.tauxMarge);
    expect(data.tauxTva).toBe(source.tauxTva);
    expect(data.tvaMention).toBe(source.tvaMention);
    expect(data.nomProjet).toBe(source.nomProjet);
    expect(data.refDevis).toBe(source.refDevis);
    expect(data.annee).toBe(source.annee);
    expect(data.tauxPipe).toBe(source.tauxPipe);
    expect(data.notes).toBe(source.notes);

    // Période d'exploitation entière préservée (ticket #69)
    expect(data.periodeExploitationDebut).toEqual(source.periodeExploitationDebut);
    expect(data.periodeExploitationFin).toEqual(source.periodeExploitationFin);
    expect(data.periodeExploitationLibelle).toBe(source.periodeExploitationLibelle);

    // dates de validité/séance copiées (pas de reset, le brouillon peut
    // garder les mêmes échéances)
    expect(data.dateValidite).toEqual(source.dateValidite);
    expect(data.dateSeance).toEqual(source.dateSeance);
  });

  test("totaux snapshot copiés tels quels (recalculés au prochain save)", () => {
    const source = makeSource();
    const data = buildDuplicatedDevisData(source, CTX);

    expect(data.sousTotal).toBe(source.sousTotal);
    expect(data.totalHt).toBe(source.totalHt);
    expect(data.remise).toBe(source.remise);
    expect(data.coproduction).toBe(source.coproduction);
    expect(data.totalApresRemise).toBe(source.totalApresRemise);
    expect(data.tva).toBe(source.tva);
    expect(data.totalTtc).toBe(source.totalTtc);
    expect(data.csComedien).toBe(source.csComedien);
    expect(data.csTechniciens).toBe(source.csTechniciens);
    expect(data.fraisGeneraux).toBe(source.fraisGeneraux);
    expect(data.marge).toBe(source.marge);
    expect(data.baseMarge).toBe(source.baseMarge);
  });

  test("client : connect par ID (pas de copie de l'objet client)", () => {
    const data = buildDuplicatedDevisData(makeSource(), CTX);
    expect(data.client).toEqual({ connect: { id: "cli-1" } });
  });

  test("sections + lignes : structure préservée, deep copy", () => {
    const source = makeSource();
    const data = buildDuplicatedDevisData(source, CTX);

    // Structure : sections.create est un tableau avec autant d'entrées
    // que le source.
    const sectionsCreate = data.sections!.create as Array<{
      companyId: string;
      titre: string;
      ordre: number;
      lignes: { create: Array<Record<string, unknown>> };
    }>;
    expect(sectionsCreate).toHaveLength(1);
    expect(sectionsCreate[0].titre).toBe("Production");
    expect(sectionsCreate[0].ordre).toBe(0);
    expect(sectionsCreate[0].companyId).toBe("comp-A");

    const lignes = sectionsCreate[0].lignes.create;
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({
      libelle: "Réalisation",
      tag: "STUDIO",
      quantite: 1,
      prixUnit: 600,
      total: 600,
      horsMarge: false,
      ordre: 0,
    });
    // La ligne MUSIQUE flaggée horsMarge est aussi copiée (le flag est
    // métier, doit être préservé — ticket #69 hors marge)
    expect(lignes[1]).toMatchObject({
      libelle: "Musique composition",
      tag: "MUSIQUE",
      horsMarge: true,
    });

    // Les ids sources ne sont PAS copiés (Prisma régénère)
    expect(lignes[0].id).toBeUndefined();
    expect(lignes[1].id).toBeUndefined();
  });

  test("duplication d'un devis BROUILLON sans numéro fonctionne", () => {
    const source = makeSource({ numero: null, statut: "BROUILLON" });
    const data = buildDuplicatedDevisData(source, CTX);
    // Le source était déjà brouillon → le dupliqué l'est aussi
    expect(data.statut).toBe("BROUILLON");
    expect(data.numero).toBeNull();
    expect(data.devisSource).toEqual({ connect: { id: "src-1" } });
  });

  test("duplication d'un devis ACCEPTE : statut redevient BROUILLON", () => {
    const source = makeSource({ statut: "ACCEPTE" });
    const data = buildDuplicatedDevisData(source, CTX);
    expect(data.statut).toBe("BROUILLON");
  });

  test("duplication d'un devis dupliqué : devisSource pointe vers le source de l'étape précédente", () => {
    // Cas : D1 → D2 (D2.devisSourceId = D1.id), puis D2 → D3.
    // D3.devisSourceId doit pointer sur D2 (le source direct), pas D1.
    const source = makeSource({
      id: "src-2",
      devisSourceId: "src-1", // était lui-même un dupliqué
    });
    const data = buildDuplicatedDevisData(source, CTX);
    expect(data.devisSource).toEqual({ connect: { id: "src-2" } });
  });
});
