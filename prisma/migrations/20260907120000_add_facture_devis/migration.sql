-- Ticket #99 : facture récapitulative multi-devis.
--
-- Table de liaison FactureDevis (N-N Facture ↔ Devis). Elle devient la source
-- de vérité de l'ensemble des devis sources d'une facture, mono comme multi.
-- Rétrocompat : la colonne "Facture"."devisId" est conservée (miroir mono) et
-- backfillée ici pour toutes les factures existantes (une ligne par facture).
--
-- Additif, non destructif : aucune colonne existante n'est modifiée. Les
-- factures mono-devis actuelles continuent de fonctionner via "devisId" ET
-- disposent désormais d'une ligne FactureDevis (voir backfill plus bas).

-- CreateTable
CREATE TABLE "FactureDevis" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,

    CONSTRAINT "FactureDevis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FactureDevis_factureId_idx" ON "FactureDevis"("factureId");

-- CreateIndex
CREATE INDEX "FactureDevis_devisId_idx" ON "FactureDevis"("devisId");

-- CreateIndex
CREATE UNIQUE INDEX "FactureDevis_factureId_devisId_key" ON "FactureDevis"("factureId", "devisId");

-- AddForeignKey
ALTER TABLE "FactureDevis" ADD CONSTRAINT "FactureDevis_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactureDevis" ADD CONSTRAINT "FactureDevis_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill idempotent : une ligne de liaison par facture mono-devis existante.
-- gen_random_uuid() est natif Postgres 13+ (pas d'extension requise). Le garde
-- NOT EXISTS rend le backfill rejouable sans doublon (la contrainte unique
-- (factureId, devisId) le garantit aussi).
INSERT INTO "FactureDevis" ("id", "factureId", "devisId")
SELECT gen_random_uuid()::text, f."id", f."devisId"
FROM "Facture" f
WHERE f."devisId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "FactureDevis" fd
    WHERE fd."factureId" = f."id" AND fd."devisId" = f."devisId"
  );
