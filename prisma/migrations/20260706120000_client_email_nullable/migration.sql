-- Client.email devient optionnel (nullable).
-- Un client peut ne pas avoir d'email renseigne (saisie manuelle Vanda).
-- Non destructif : les emails existants sont conserves, seule la contrainte
-- NOT NULL est levee.

ALTER TABLE "Client" ALTER COLUMN "email" DROP NOT NULL;
