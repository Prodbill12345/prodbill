-- Ticket #98 : le numéro de facture est désormais attribué à l'émission
-- (pas à la création). Un brouillon n'a plus de numéro → colonne nullable.
--
-- Additif, non destructif : les numéros existants sont conservés, seule la
-- contrainte NOT NULL est levée. La contrainte @@unique([companyId, numero])
-- reste en place et continue de protéger les factures émises contre les
-- doublons ; en Postgres les valeurs NULL sont distinctes, donc plusieurs
-- brouillons sans numéro coexistent sans conflit.
--
-- La mise à NULL des 2 brouillons legacy ("26011-S1", "26031-S1") et le reset
-- des compteurs FACTURE (NONNA→4, Caleson→0) sont faits SÉPARÉMENT par
-- scripts/migrate-legacy-facture-drafts.ts (dry-run/--confirm), APRÈS
-- déploiement du code null-safe.

ALTER TABLE "Facture" ALTER COLUMN "numero" DROP NOT NULL;
