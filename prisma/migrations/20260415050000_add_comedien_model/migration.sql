-- CreateTable Comedien
CREATE TABLE "Comedien" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Comedien_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comedien_companyId_idx" ON "Comedien"("companyId");
CREATE INDEX "Comedien_agentId_idx" ON "Comedien"("agentId");
ALTER TABLE "Comedien" ADD CONSTRAINT "Comedien_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comedien" ADD CONSTRAINT "Comedien_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable DevisLigne: replace nomComedien with comedienId
ALTER TABLE "DevisLigne" DROP COLUMN IF EXISTS "nomComedien";
ALTER TABLE "DevisLigne" ADD COLUMN IF NOT EXISTS "comedienId" TEXT;
ALTER TABLE "DevisLigne" ADD CONSTRAINT "DevisLigne_comedienId_fkey" FOREIGN KEY ("comedienId") REFERENCES "Comedien"("id") ON DELETE SET NULL ON UPDATE CASCADE;
