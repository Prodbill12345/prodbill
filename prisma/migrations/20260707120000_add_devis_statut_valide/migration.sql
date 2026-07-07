-- Ticket #96 : nouveau statut VALIDE.
-- Semantique : Vanda a valide le devis en interne, elle peut creer une
-- facture, SANS envoi mail au client.
-- Ordre logique : BROUILLON -> VALIDE -> ENVOYE -> ACCEPTE -> REFUSE -> EXPIRE.
--
-- Additif et non destructif : ajoute une valeur a l'enum, ne touche aucune
-- donnee existante. La migration n'UTILISE pas la nouvelle valeur, donc
-- l'ADD VALUE reste sur en transaction (PG 12+).

ALTER TYPE "DevisStatut" ADD VALUE 'VALIDE' BEFORE 'ENVOYE';
