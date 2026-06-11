-- Ticket #93 : duplication de devis.
-- Trace le devis original quand un devis est cree via /api/devis/[id]/dupliquer.
-- ON DELETE SET NULL : si le source est supprime, le dupliquera perd sa
-- trace de provenance mais reste vivant.

ALTER TABLE "Devis" ADD COLUMN "devisSourceId" TEXT;

ALTER TABLE "Devis" ADD CONSTRAINT "Devis_devisSourceId_fkey"
  FOREIGN KEY ("devisSourceId") REFERENCES "Devis"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
