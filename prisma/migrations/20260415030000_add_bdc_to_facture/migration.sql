-- AlterTable: Add numeroBdc to Facture
ALTER TABLE "Facture" ADD COLUMN IF NOT EXISTS "numeroBdc" TEXT;
