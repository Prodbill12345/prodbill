CREATE TYPE "RelanceType" AS ENUM ('ENVOI', 'RELANCE_1', 'RELANCE_2', 'MISE_EN_DEMEURE');

CREATE TABLE "Relance" (
  "id"          TEXT NOT NULL,
  "factureId"   TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "type"        "RelanceType" NOT NULL,
  "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentTo"      TEXT NOT NULL,
  "subject"     TEXT NOT NULL,
  "createdById" TEXT NOT NULL,

  CONSTRAINT "Relance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Relance_factureId_idx" ON "Relance"("factureId");
CREATE INDEX "Relance_companyId_idx" ON "Relance"("companyId");

ALTER TABLE "Relance" ADD CONSTRAINT "Relance_factureId_fkey"
  FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
