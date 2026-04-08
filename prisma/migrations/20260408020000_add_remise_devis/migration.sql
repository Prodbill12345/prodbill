-- Migration : ajout du champ remise exceptionnelle sur les devis
ALTER TABLE "Devis" ADD COLUMN "remise" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Devis" ADD COLUMN "totalApresRemise" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Pour les devis existants, totalApresRemise = totalHt (remise = 0)
UPDATE "Devis" SET "totalApresRemise" = "totalHt";
