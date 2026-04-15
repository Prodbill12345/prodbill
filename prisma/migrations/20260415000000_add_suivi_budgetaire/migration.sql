-- AlterTable: tauxPipe sur Devis
ALTER TABLE "Devis" ADD COLUMN "tauxPipe" INTEGER;

-- CreateTable BudgetPrevisionnel
CREATE TABLE "BudgetPrevisionnel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetPrevisionnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable BudgetLigne
CREATE TABLE "BudgetLigne" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montantPrevisionnel" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetLigne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPrevisionnel_companyId_annee_key" ON "BudgetPrevisionnel"("companyId", "annee");
CREATE INDEX "BudgetPrevisionnel_companyId_idx" ON "BudgetPrevisionnel"("companyId");
CREATE INDEX "BudgetLigne_budgetId_idx" ON "BudgetLigne"("budgetId");

-- AddForeignKey
ALTER TABLE "BudgetPrevisionnel" ADD CONSTRAINT "BudgetPrevisionnel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLigne" ADD CONSTRAINT "BudgetLigne_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "BudgetPrevisionnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLigne" ADD CONSTRAINT "BudgetLigne_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON UPDATE CASCADE;
