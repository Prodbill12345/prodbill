-- AlterTable: Add nomCommercial to BudgetLigne
ALTER TABLE "BudgetLigne" ADD COLUMN IF NOT EXISTS "nomCommercial" TEXT;
