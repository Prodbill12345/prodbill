-- Migration : refonte du système de tags de lignes de devis
-- COMEDIEN + DROIT → ARTISTE (CS Comédiens)
-- FORFAIT → STUDIO (pas de CS)
-- MATERIEL → MUSIQUE (pas de CS)
-- TECHNICIEN_HCS et AGENT : inchangés

-- Étape 1 : ajouter les nouvelles valeurs à l'enum existant
ALTER TYPE "LigneTag" ADD VALUE 'ARTISTE';
ALTER TYPE "LigneTag" ADD VALUE 'STUDIO';
ALTER TYPE "LigneTag" ADD VALUE 'MUSIQUE';

-- Étape 2 : migrer les données existantes dans DevisLigne
UPDATE "DevisLigne" SET tag = 'ARTISTE' WHERE tag IN ('COMEDIEN', 'DROIT');
UPDATE "DevisLigne" SET tag = 'STUDIO'  WHERE tag = 'FORFAIT';
UPDATE "DevisLigne" SET tag = 'MUSIQUE' WHERE tag = 'MATERIEL';

-- Étape 3 : migrer les tags dans le JSON des DevisTemplate
UPDATE "DevisTemplate"
SET sections = (
  SELECT jsonb_agg(
    jsonb_set(
      section,
      '{lignes}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN ligne->>'tag' IN ('COMEDIEN', 'DROIT') THEN jsonb_set(ligne, '{tag}', '"ARTISTE"')
            WHEN ligne->>'tag' = 'FORFAIT'              THEN jsonb_set(ligne, '{tag}', '"STUDIO"')
            WHEN ligne->>'tag' = 'MATERIEL'             THEN jsonb_set(ligne, '{tag}', '"MUSIQUE"')
            ELSE ligne
          END
        )
        FROM jsonb_array_elements(section->'lignes') AS ligne
      )
    )
  )
  FROM jsonb_array_elements(sections) AS section
);

-- Étape 4 : recréer le type sans les anciennes valeurs
ALTER TABLE "DevisLigne" ALTER COLUMN tag TYPE text;
DROP TYPE "LigneTag";
CREATE TYPE "LigneTag" AS ENUM ('ARTISTE', 'TECHNICIEN_HCS', 'STUDIO', 'MUSIQUE', 'AGENT');
ALTER TABLE "DevisLigne" ALTER COLUMN tag TYPE "LigneTag" USING tag::"LigneTag";
