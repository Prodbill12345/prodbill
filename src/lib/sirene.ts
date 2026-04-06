/**
 * Vérification SIRET via l'API Recherche Entreprises (data.gouv.fr)
 * Documentation : https://recherche-entreprises.api.gouv.fr
 *
 * API publique, sans authentification requise.
 * L'ancienne API INSEE v3 (api.insee.fr) est rejetée avec 401 sans clé Bearer.
 */

export interface SireneResult {
  siret: string;
  siren: string;
  denominationUsuelle: string;
  enseigne: string | null;
  activitePrincipale: string;
  adresseEtablissement: {
    numeroVoie: string | null;
    typeVoie: string | null;
    libelleVoie: string | null;
    codePostal: string | null;
    libelleCommuneEtranger: string | null;
    libelleMunicipalite: string | null;
  };
  etatAdministratif: "A" | "F"; // A = actif, F = fermé
}

export async function verifySiret(siret: string): Promise<SireneResult | null> {
  const cleanSiret = siret.replace(/[\s-]/g, "");
  if (cleanSiret.length !== 14) return null;

  try {
    const res = await fetch(
      `https://recherche-entreprises.api.gouv.fr/search?q=${cleanSiret}&page=1&per_page=1`,
      { next: { revalidate: 3600 } } // Cache 1h côté Next.js
    );

    if (!res.ok) return null;

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data.results?.[0] as any;
    if (!result) return null;

    // Établissement correspondant au SIRET recherché
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const etab = (result.matching_etablissements as any[])?.find(
      (e) => e.siret === cleanSiret
    ) ?? (result.siege?.siret === cleanSiret ? result.siege : null);

    if (!etab) return null;

    // Le siège social expose numero_voie / type_voie / libelle_voie séparément.
    // Les établissements secondaires n'ont que le champ "adresse" pré-formaté —
    // on extrait la rue en retirant le code postal et la ville depuis la fin.
    const siege = result.siege;
    const isSiege = siege?.siret === cleanSiret;

    let numeroVoie: string | null = null;
    let typeVoie: string | null = null;
    let libelleVoie: string | null = null;

    if (isSiege) {
      numeroVoie = siege.numero_voie ?? null;
      typeVoie = siege.type_voie ?? null;
      libelleVoie = siege.libelle_voie ?? null;
    } else if (etab.adresse) {
      // Retirer le code postal (et tout ce qui suit) de la fin de l'adresse
      const codePostal: string = etab.code_postal ?? "";
      const postalIdx = codePostal ? etab.adresse.indexOf(codePostal) : -1;
      libelleVoie = (postalIdx > 0
        ? etab.adresse.slice(0, postalIdx)
        : etab.adresse
      ).trim();
    }

    return {
      siret: cleanSiret,
      siren: result.siren,
      denominationUsuelle: result.nom_raison_sociale ?? result.nom_complet ?? "",
      enseigne: etab.nom_commercial ?? siege?.nom_commercial ?? null,
      activitePrincipale: result.activite_principale ?? etab.activite_principale ?? "",
      adresseEtablissement: {
        numeroVoie,
        typeVoie,
        libelleVoie,
        codePostal: etab.code_postal ?? siege?.code_postal ?? null,
        libelleCommuneEtranger: etab.libelle_commune_etranger ?? null,
        libelleMunicipalite: etab.libelle_commune ?? siege?.libelle_commune ?? null,
      },
      etatAdministratif: etab.etat_administratif === "A" ? "A" : "F",
    };
  } catch {
    return null;
  }
}

/**
 * Formate la rue depuis un résultat Sirene (sans code postal ni ville,
 * ceux-ci étant renseignés dans des champs séparés)
 */
export function formatAdresseSirene(result: SireneResult): string {
  const { adresseEtablissement: a } = result;
  return [a.numeroVoie, a.typeVoie, a.libelleVoie].filter(Boolean).join(" ");
}
