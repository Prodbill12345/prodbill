-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DIRECTEUR_PROD', 'CHARGE_DE_PROD', 'COMPTABLE', 'STAGIAIRE');

-- CreateEnum
CREATE TYPE "LigneTag" AS ENUM ('COMEDIEN', 'TECHNICIEN_HCS', 'DROIT', 'FORFAIT', 'MATERIEL');

-- CreateEnum
CREATE TYPE "DevisStatut" AS ENUM ('BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE');

-- CreateEnum
CREATE TYPE "FactureType" AS ENUM ('ACOMPTE', 'SOLDE', 'AVOIR');

-- CreateEnum
CREATE TYPE "FactureStatut" AS ENUM ('BROUILLON', 'EMISE', 'PAYEE_PARTIEL', 'PAYEE', 'EN_RETARD', 'ANNULEE');

-- CreateEnum
CREATE TYPE "CounterType" AS ENUM ('DEVIS', 'FACTURE', 'BDC');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "tvaIntra" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL,
    "bic" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3B82F6',
    "defaultTauxFg" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "defaultTauxMarge" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "defaultTauxCsComedien" DOUBLE PRECISION NOT NULL DEFAULT 0.57,
    "defaultTauxCsTech" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "conditionsPaiement" TEXT NOT NULL DEFAULT 'Paiement à 30 jours. Pénalités de retard : 15% par an exigibles à 45 jours. Indemnité forfaitaire de recouvrement : 40 €.',
    "clerkOrgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAGIAIRE',
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "siret" TEXT,
    "tvaIntra" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "tauxFgOverride" DOUBLE PRECISION,
    "tauxMargeOverride" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "numero" TEXT,
    "objet" TEXT NOT NULL,
    "statut" "DevisStatut" NOT NULL DEFAULT 'BROUILLON',
    "tauxCsComedien" DOUBLE PRECISION NOT NULL,
    "tauxCsTech" DOUBLE PRECISION NOT NULL,
    "tauxFg" DOUBLE PRECISION NOT NULL,
    "tauxMarge" DOUBLE PRECISION NOT NULL,
    "sousTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "csComedien" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "csTechniciens" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseMarge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fraisGeneraux" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalHt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tva" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTtc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateEmission" TIMESTAMP(3),
    "dateValidite" TIMESTAMP(3),
    "notes" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisSection" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "DevisSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevisLigne" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "tag" "LigneTag" NOT NULL,
    "quantite" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "prixUnit" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "DevisLigne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facture" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "devisId" TEXT,
    "numero" TEXT NOT NULL,
    "type" "FactureType" NOT NULL,
    "statut" "FactureStatut" NOT NULL DEFAULT 'BROUILLON',
    "totalHt" DOUBLE PRECISION NOT NULL,
    "tva" DOUBLE PRECISION NOT NULL,
    "totalTtc" DOUBLE PRECISION NOT NULL,
    "dateEmission" TIMESTAMP(3),
    "dateEcheance" TIMESTAMP(3),
    "datePaiement" TIMESTAMP(3),
    "siretEmetteur" TEXT NOT NULL DEFAULT '',
    "tvaIntraEmetteur" TEXT NOT NULL DEFAULT '',
    "ibanEmetteur" TEXT NOT NULL DEFAULT '',
    "bicEmetteur" TEXT NOT NULL DEFAULT '',
    "conditionsPaiement" TEXT NOT NULL DEFAULT '',
    "nomEmetteur" TEXT NOT NULL DEFAULT '',
    "adresseEmetteur" TEXT NOT NULL DEFAULT '',
    "pdfUrl" TEXT,
    "facturxUrl" TEXT,
    "emiseAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BDC" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BDC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "mode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" "CounterType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "devisId" TEXT,
    "factureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_siret_key" ON "Company"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "Company_clerkOrgId_key" ON "Company"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Devis_companyId_idx" ON "Devis"("companyId");

-- CreateIndex
CREATE INDEX "Devis_clientId_idx" ON "Devis"("clientId");

-- CreateIndex
CREATE INDEX "DevisSection_devisId_idx" ON "DevisSection"("devisId");

-- CreateIndex
CREATE INDEX "DevisLigne_sectionId_idx" ON "DevisLigne"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numero_key" ON "Facture"("numero");

-- CreateIndex
CREATE INDEX "Facture_companyId_idx" ON "Facture"("companyId");

-- CreateIndex
CREATE INDEX "Facture_clientId_idx" ON "Facture"("clientId");

-- CreateIndex
CREATE INDEX "Facture_devisId_idx" ON "Facture"("devisId");

-- CreateIndex
CREATE UNIQUE INDEX "BDC_devisId_key" ON "BDC"("devisId");

-- CreateIndex
CREATE UNIQUE INDEX "BDC_numero_key" ON "BDC"("numero");

-- CreateIndex
CREATE INDEX "Paiement_factureId_idx" ON "Paiement"("factureId");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_companyId_year_type_key" ON "Counter"("companyId", "year", "type");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devis" ADD CONSTRAINT "Devis_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisSection" ADD CONSTRAINT "DevisSection_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevisLigne" ADD CONSTRAINT "DevisLigne_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "DevisSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facture" ADD CONSTRAINT "Facture_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BDC" ADD CONSTRAINT "BDC_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
