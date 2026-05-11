-- AlterTable : ajoute le taux de TVA appliqué (snapshot) sur Devis et Facture.
-- Default 20% (taux normal). Cas non standard : SACEM à 10%, alimentation 5.5%,
-- export hors UE 0%… Calculé à l'import comme round(tva / totalHt × 100, 2).
ALTER TABLE "Devis"   ADD COLUMN "tauxTva" DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE "Facture" ADD COLUMN "tauxTva" DOUBLE PRECISION NOT NULL DEFAULT 20;
