-- AlterTable : ajoute le snapshot remise + co-production sur Devis et Facture.
-- La col CSV "REMISE EXCEPTIONNELLE" et "CO-PRODUCTION..." passent de lignes
-- positives parasites à des montants déductibles propres dans le récap.
-- Devis.remise existe déjà (non touché).
ALTER TABLE "Devis"   ADD COLUMN "coproduction" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "remise"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "coproduction" DOUBLE PRECISION NOT NULL DEFAULT 0;
