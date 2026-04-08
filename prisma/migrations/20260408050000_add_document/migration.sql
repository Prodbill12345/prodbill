-- CreateTable
CREATE TABLE "Document" (
    "id"        TEXT         NOT NULL,
    "companyId" TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "url"       TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");
