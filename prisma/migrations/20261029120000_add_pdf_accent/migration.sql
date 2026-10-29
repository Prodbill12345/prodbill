-- C-PDF-ACCENT-PAR-COMPANY (29/10/2026) : accent des documents PDF par société.
-- Additif, nullable, SANS backfill : NULL = Majorelle (accent actuel), donc
-- aucune société ni aucune pièce existante ne change d'apparence.
ALTER TABLE "Company" ADD COLUMN "pdfAccent" TEXT;

-- Accent figé à l'émission d'une facture / d'un avoir (même logique que les
-- autres snapshots d'émission). Les pièces déjà émises restent NULL → Majorelle.
ALTER TABLE "Facture" ADD COLUMN "pdfAccent" TEXT;
