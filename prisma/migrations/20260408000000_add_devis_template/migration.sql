CREATE TABLE "DevisTemplate" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sections" JSONB NOT NULL,
  "tauxCsComedien" DOUBLE PRECISION NOT NULL,
  "tauxCsTech" DOUBLE PRECISION NOT NULL,
  "tauxFg" DOUBLE PRECISION NOT NULL,
  "tauxMarge" DOUBLE PRECISION NOT NULL,
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DevisTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DevisTemplate_companyId_idx" ON "DevisTemplate"("companyId");
CREATE INDEX "DevisTemplate_userId_idx" ON "DevisTemplate"("userId");

ALTER TABLE "DevisTemplate" ADD CONSTRAINT "DevisTemplate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DevisTemplate" ADD CONSTRAINT "DevisTemplate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
