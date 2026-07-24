-- Masque TVA + Total TTC sur les DEVIS (affichage + PDF) d'une societe.
-- Additif, non destructif : nouvelle colonne booleenne avec default false,
-- donc tous les workspaces existants gardent le comportement actuel.
-- Configure a true uniquement pour NONNA (voir scripts/set-nonna-hide-tva-devis.ts).

ALTER TABLE "Company" ADD COLUMN "hideTvaTtcOnDevis" BOOLEAN NOT NULL DEFAULT false;
