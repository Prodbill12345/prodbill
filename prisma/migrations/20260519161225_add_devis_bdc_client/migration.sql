-- AlterTable Devis : ajout des 3 champs pour le BDC client reçu
-- (fichier scanné PDF/JPG/PNG uploadé par l'utilisateur).
-- Distinct du modèle BDC (auto-généré, sortant) et du champ
-- Facture.numeroBdc (référence texte). Ticket #79.
ALTER TABLE "Devis" ADD COLUMN "bdcClientUrl" TEXT;
ALTER TABLE "Devis" ADD COLUMN "bdcClientFilename" TEXT;
ALTER TABLE "Devis" ADD COLUMN "bdcClientUploadedAt" TIMESTAMP(3);
