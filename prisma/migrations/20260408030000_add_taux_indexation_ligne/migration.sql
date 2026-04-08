-- Migration : ajout du taux d'indexation annuelle par ligne de devis
ALTER TABLE "DevisLigne" ADD COLUMN "tauxIndexation" DOUBLE PRECISION NOT NULL DEFAULT 0;
