-- AlterTable : décomposition des montants snapshot sur Facture
-- Permet de reproduire le bloc récapitulatif du devis (CS/FG/Marge) sur
-- la facture. Pour un ACOMPTE, ces valeurs sont ramenées au prorata.
ALTER TABLE "Facture" ADD COLUMN "sousTotal"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "csComedien"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "csTechniciens"  DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "baseMarge"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "fraisGeneraux"  DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "marge"          DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "tauxCsComedien" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "tauxCsTech"     DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "tauxFg"         DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Facture" ADD COLUMN "tauxMarge"      DOUBLE PRECISION NOT NULL DEFAULT 0;
