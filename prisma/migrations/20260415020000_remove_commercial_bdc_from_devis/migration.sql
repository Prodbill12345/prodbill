-- AlterTable: Remove nomCommercial and numeroBdc from Devis
ALTER TABLE "Devis" DROP COLUMN IF EXISTS "nomCommercial";
ALTER TABLE "Devis" DROP COLUMN IF EXISTS "numeroBdc";
