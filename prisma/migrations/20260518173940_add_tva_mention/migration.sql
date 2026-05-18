-- AlterTable Devis : ajout du champ tvaMention (mention légale custom pour TVA non applicable)
ALTER TABLE "Devis" ADD COLUMN "tvaMention" TEXT;

-- AlterTable Facture : snapshot du tvaMention au moment de l'émission
ALTER TABLE "Facture" ADD COLUMN "tvaMention" TEXT;
