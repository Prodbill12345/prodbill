-- AlterTable DevisLigne : ajout du flag horsMarge.
-- Si true, la ligne et son indexation sont exclues du baseMarge
-- (calcul Frais Généraux + Marge). Les charges sociales et le
-- sousTotal HT restent inchangés. Cas d'usage : lignes Musique
-- (composition, droits) à ne pas surfacturer via la marge.
ALTER TABLE "DevisLigne" ADD COLUMN "horsMarge" BOOLEAN NOT NULL DEFAULT false;
