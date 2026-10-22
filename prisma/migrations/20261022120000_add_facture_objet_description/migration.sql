-- AlterTable Facture : objet + description du projet
-- (FEAT-FACTURE-OBJET-DESCRIPTION, Vanda 22/10/2026).
-- Additif, nullable. Snapshot du devis à la création d'une facture mono.
ALTER TABLE "Facture" ADD COLUMN "objet" TEXT;
ALTER TABLE "Facture" ADD COLUMN "descriptionProjet" TEXT;

-- Backfill : BROUILLONS MONO uniquement (devisId renseigné), copie depuis le
-- devis lié. Les pièces émises (statut <> BROUILLON ou emiseAt renseigné)
-- restent NULL — on ne change pas le rendu d'un document émis. Les récaps
-- (devisId NULL) restent NULL par conception. Chaînes vides → NULL.
UPDATE "Facture" f
SET "objet"             = NULLIF(btrim(d."objet"), ''),
    "descriptionProjet" = NULLIF(btrim(d."description"), '')
FROM "Devis" d
WHERE d."id" = f."devisId"
  AND f."statut" = 'BROUILLON'
  AND f."emiseAt" IS NULL;
