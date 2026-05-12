-- Phase 1 multi-tenant : scope direct par companyId sur les tables
-- jusqu'ici scopées indirectement, et passage des numéros de Facture/BDC
-- à l'unicité par tenant.
--
-- Ordre des opérations pour rejouabilité sur BD existante :
--   1. ADD COLUMN nullable
--   2. UPDATE (backfill depuis la table parente)
--   3. ALTER COLUMN SET NOT NULL
--   4. FK + index + unique scopée

-- ──────────────────────────────────────────────────────────────────────
-- 1. Ajout des colonnes companyId (nullables au départ pour permettre
--    le backfill avant la contrainte NOT NULL).
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE "DevisSection" ADD COLUMN "companyId" TEXT;
ALTER TABLE "DevisLigne"   ADD COLUMN "companyId" TEXT;
ALTER TABLE "BDC"          ADD COLUMN "companyId" TEXT;
ALTER TABLE "Paiement"     ADD COLUMN "companyId" TEXT;
ALTER TABLE "BudgetLigne"  ADD COLUMN "companyId" TEXT;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Backfill via les FK existantes vers les tables parentes.
--    No-op sur une BD vierge.
-- ──────────────────────────────────────────────────────────────────────
UPDATE "DevisSection" ds
   SET "companyId" = d."companyId"
   FROM "Devis" d
   WHERE ds."devisId" = d.id;

UPDATE "DevisLigne" dl
   SET "companyId" = d."companyId"
   FROM "DevisSection" ds
   JOIN "Devis" d ON ds."devisId" = d.id
   WHERE dl."sectionId" = ds.id;

UPDATE "BDC" b
   SET "companyId" = d."companyId"
   FROM "Devis" d
   WHERE b."devisId" = d.id;

UPDATE "Paiement" p
   SET "companyId" = f."companyId"
   FROM "Facture" f
   WHERE p."factureId" = f.id;

UPDATE "BudgetLigne" bl
   SET "companyId" = bp."companyId"
   FROM "BudgetPrevisionnel" bp
   WHERE bl."budgetId" = bp.id;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Passage en NOT NULL une fois le backfill garanti.
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE "DevisSection" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DevisLigne"   ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BDC"          ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Paiement"     ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "BudgetLigne"  ALTER COLUMN "companyId" SET NOT NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Clés étrangères vers Company.
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE "DevisSection" ADD CONSTRAINT "DevisSection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "DevisLigne"   ADD CONSTRAINT "DevisLigne_companyId_fkey"   FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "BDC"          ADD CONSTRAINT "BDC_companyId_fkey"          FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Paiement"     ADD CONSTRAINT "Paiement_companyId_fkey"     FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "BudgetLigne"  ADD CONSTRAINT "BudgetLigne_companyId_fkey"  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- FK manquante sur Relance.companyId (le champ existait sans relation).
ALTER TABLE "Relance" ADD CONSTRAINT "Relance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Index sur companyId pour la perf des filtres par tenant.
-- ──────────────────────────────────────────────────────────────────────
CREATE INDEX "DevisSection_companyId_idx" ON "DevisSection"("companyId");
CREATE INDEX "DevisLigne_companyId_idx"   ON "DevisLigne"("companyId");
CREATE INDEX "BDC_companyId_idx"          ON "BDC"("companyId");
CREATE INDEX "Paiement_companyId_idx"     ON "Paiement"("companyId");
CREATE INDEX "BudgetLigne_companyId_idx"  ON "BudgetLigne"("companyId");

-- ──────────────────────────────────────────────────────────────────────
-- 6. Numéros uniques scopés par tenant (au lieu de @unique global).
--    Permet à 2 workspaces de réutiliser la même séquence (25-0042…).
-- ──────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "Facture_numero_key";
DROP INDEX IF EXISTS "BDC_numero_key";
CREATE UNIQUE INDEX "Facture_companyId_numero_key" ON "Facture"("companyId", "numero");
CREATE UNIQUE INDEX "BDC_companyId_numero_key"     ON "BDC"("companyId", "numero");
