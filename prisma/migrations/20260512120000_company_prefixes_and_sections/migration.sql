-- AlterTable Company : ajout préfixes de numérotation et sections custom
-- pour configurer la génération de numéros et le builder de devis par workspace.
ALTER TABLE "Company" ADD COLUMN "prefixDevis"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN "prefixFacture"  TEXT NOT NULL DEFAULT '';
ALTER TABLE "Company" ADD COLUMN "customSections" JSONB NOT NULL DEFAULT '[]';
