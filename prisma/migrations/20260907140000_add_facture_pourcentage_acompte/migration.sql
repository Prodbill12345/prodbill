-- Ticket #99 (BUG-RECAP-BROUILLON-STALE) : mémoriser le pourcentage d'acompte
-- sur la facture, pour recalculer exactement le montant d'un ACOMPTE brouillon
-- quand le devis source change avant l'émission.
--
-- Additif, non destructif : colonne nullable, aucun backfill. NULL pour les
-- SOLDE/AVOIR et pour les acomptes existants (le recalcul retombe alors sur le
-- ratio totalHt/devis.totalHt, exact tant que la facture n'a pas dérivé).

ALTER TABLE "Facture" ADD COLUMN "pourcentageAcompte" DOUBLE PRECISION;
