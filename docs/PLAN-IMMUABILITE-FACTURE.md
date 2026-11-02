# Plan — Chantier IMMUABILITE-FACTURE

> Rédigé le 29/10/2026, relu et arbitré par Rose le 29/10 (positions intégrées,
> voir § 7). **Aucun code avant la session dédiée.** Le code se fera
> dans une session dédiée. Ticket et énoncés d'origine : `docs/TODO-SPRINTS.md`
> (chantier IMMUABILITE-FACTURE, briques A à D).

## 0. Objectif et état des lieux

**Objectif** : une facture émise (ou un avoir) ne change plus jamais, quoi
qu'on fasse ensuite sur le devis ou le client (art. 289 CGI). Aujourd'hui elle
change, parce qu'une partie de son contenu est relue en direct.

| Élément de la facture | Aujourd'hui | Après le chantier |
|---|---|---|
| Totaux, décomposition CS / FG / marge, taux, TVA | figés (#99) | inchangé |
| Émetteur (SIRET, TVA, IBAN, adresse…) | figé | inchangé |
| Objet, description, période d'exploitation | figés | inchangé |
| Accent PDF | figé (29/10) | inchangé |
| **Sections et lignes** | **relues sur le devis, au prorata** | **figées** (brique A) |
| **Liste des devis d'une récap** | **relue sur les devis** | **figée** (brique A) |
| **Client destinataire** | **relu sur la fiche client** | **figé** (brique B) |

**Chiffres prod (lecture seule, 29/10/2026)** — 141 pièces émises, toutes avec
`emiseAt` renseigné :

| | Total | Soldes | Avoirs | Dont récaps | Devis modifié après émission* | Client modifié après émission* |
|---|---|---|---|---|---|---|
| Caleson | 125 | 123 | 2 | 7 | 1 | 9 |
| NONNA | 16 | 16 | 0 | 0 | 4 | 5 |

\* Signal faible : `updatedAt` > `emiseAt`. Un changement de statut ou une
correction sans effet sur la facture le déclenche aussi. Voir § 2.

Aucun acompte émis à ce jour, aucune facture sans devis.

---

## 1. Modèle cible (briques A + B)

### A — Sections et lignes figées

Deux tables nouvelles, remplies à l'émission :

- `FactureSection` : `factureId`, `companyId`, `ordre`, `titre`.
- `FactureLigne` : `factureSectionId`, `companyId`, `ordre`, `libelle`, `tag`,
  `quantite`, `prixUnit`, `total`, `tauxIndexation`, `montantIndexation`,
  `horsMarge`, `horsCS`, **`offert` + valeur offerte** (C-LIGNE-OFFERTE,
  02/11/2026 — si livré avant le chantier), plus pour une récap
  `sourceDevisId`, `sourceDevisNumero`, `sourceDevisObjet`.

Règle : on fige **les valeurs telles qu'affichées** (prix unitaire et total
déjà ramenés au prorata et arrondis comme aujourd'hui), pas les valeurs du
devis. Le rendu d'une pièce émise devient une simple lecture, sans calcul.

Cas particuliers :
- **Récap multi-devis** : une section « Devis regroupés », une ligne par devis
  (numéro, objet, montant HT net).
- **Avoir** : une seule ligne (« Avoir sur devis n° … » + montant), comme le
  rendu actuel.
- **Brouillon** : rien de figé, rendu en direct comme aujourd'hui.

### B — Client figé

Colonnes sur `Facture` (nullable) : `clientNom`, `clientAdresse`,
`clientCodePostal`, `clientVille`, `clientSiret`, `clientTvaIntra`,
`clientEmail` — exactement ce qu'impriment le PDF, la page détail, le XML
Factur-X et les exports. `clientId` reste (relations, filtres, historique).

**Décidé (Rose, 29/10)** : `clientSiren` (dérivé du SIRET) est figé dès le
commit 1 — mention obligatoire de la réforme 2027, cela évite un second
backfill pour CONFORMITE-2027.

### Traçabilité du snapshot

`Facture.snapshotSource` : `EMISSION` (posé à l'émission), `BACKFILL` (rempli
après coup à partir de l'état actuel, sans écart détecté), `A_REVOIR` (écart
détecté, en attente de la décision de Vanda — voir § 2.3), et `snapshotAt`.
Permet de savoir, pour chaque pièce, d'où vient ce qu'elle affiche.

### Écriture à l'émission

- Route `emettre` : aujourd'hui le passage BROUILLON → EMISE est un
  `updateMany` conditionnel (anti double-clic). Il devient une **transaction** :
  passage de statut + numéro + création des sections / lignes + client figé,
  tout ou rien.
- Création d'un avoir : copie le client figé de la facture annulée (même
  destinataire) et crée sa ligne unique.

---

## 2. Backfill des 141 pièces déjà émises (point 1)

### 2.1 D'où viennent leurs lignes et leur client

**Dans l'app, de l'état actuel, et de rien d'autre.** L'app ne garde aucune
autre trace du contenu d'origine :
- les PDF émis ne sont pas archivés (`pdfUrl` jamais écrit, cf. #91) ;
- aucun AuditLog n'enregistre les modifications de devis ni de client ;
- les mails sont coupés (`MAIL_KILL_SWITCH`), donc pas de PJ envoyée à retrouver.

**Hors de l'app, les originaux existent probablement** : Vanda a envoyé ses
factures à la main, les PDF d'origine sont dans ses mails envoyés, et sans
doute dans Dext. C'est la référence pour toutes les pièces signalées (§ 2.2).

Conséquence : le backfill fige **ce que la pièce affiche aujourd'hui**. Pour
les pièces dont rien n'a bougé depuis l'émission, c'est exactement l'original.
Pour les autres, il faut le savoir et décider — d'où la détection.

### 2.2 Détection des pièces dont le devis ou le client a changé

Script **en lecture seule**, lancé une première fois avant la migration (pour
décider) et une seconde juste avant le backfill (pour confirmer). Pour chaque
pièce émise :

| Contrôle | Méthode | Ce qu'il détecte |
|---|---|---|
| D1 — Totaux | Recalcul « ce que serait la facture aujourd'hui » avec la fonction déjà utilisée pour les brouillons (`computeFacturePersistTotals`, pure, sans écriture), comparé aux totaux figés HT / TVA / TTC à 0,01 € près | Montants du devis modifiés depuis l'émission |
| D2 — Décomposition | Somme des lignes actuelles au prorata comparée au sous-total figé ; CS, FG, marge comparés à la décomposition figée | Lignes déplacées entre catégories, taux changés, compensations qui gardent le même total |
| D3 — Récap | Somme des montants nets actuels des devis regroupés comparée au total HT figé | Devis d'une récap modifié |
| D4 — Indice devis | `Devis.updatedAt` > `emiseAt` | Toute modification ultérieure (bruit : statuts) |
| D5 — Client | `Client.updatedAt` > `emiseAt` | Fiche client modifiée : les coordonnées affichées peuvent différer de l'original, **sans moyen de retrouver l'original** |

**Non détectable** : une modification de texte seule (libellé, titre de
section, ordre des sections) qui ne change aucun montant. Aucune trace ne
permet de la voir ; on l'écrit noir sur blanc dans le rapport.

**Sortie** : deux listes (Markdown + CSV), triées par date d'émission,
pensées pour que Vanda compare avec ses **originaux** — les PDF qu'elle a
envoyés à la main (mails envoyés, probablement aussi dans Dext). **Rien n'est
corrigé en silence.**

*Liste 1 — devis modifiés (D1 à D4)*, une ligne par pièce :
numéro de facture, client, date d'émission, devis source, total HT figé /
actuel, total TTC figé / actuel, écart TTC, contrôles en écart. Les 5 pièces
signalées par D4 aujourd'hui y figurent toutes, même sans écart de montant
(changement possible du texte seul : seul l'original peut le dire).

*Liste 2 — clients modifiés (D5)*, une ligne par pièce : numéro, date
d'émission, client, date de dernière modification de la fiche, puis la
**valeur actuelle de chaque champ imprimé** (raison sociale, adresse, code
postal, ville, SIRET, TVA intracommunautaire, email).

**Limite à connaître pour la liste 2** : la base ne peut pas dire *quel* champ
a changé. Il n'existe aucun historique des fiches client (pas d'AuditLog, pas
d'ancienne copie, pas de client figé sur la facture). Pire, la date de
modification bouge aussi quand une fiche est enregistrée sans changement réel :
une partie des 14 est sans doute anodine. Le tri anodin / sensible se fait
donc en comparant chaque champ à l'original :
- original PDF (mails envoyés de Vanda, Dext) pour tous les champs ;
- **exports FEC déjà transmis au comptable** : ils contiennent la raison
  sociale et le SIRET à la date de l'export — source indépendante pour les
  deux champs les plus sensibles (le compte 411 en dépend).

À partir de maintenant (brique D), toute modification de fiche client est
journalisée avec l'avant / après (`CLIENT_MODIFIE`) : la question « quel champ
a changé » aura une réponse pour l'avenir.

### 2.3 Décision par pièce (arbitrage Rose, 29/10)

**Les totaux figés à l'émission font foi.** Aucune correction automatique.

- **Aucun écart, aucun signal** → snapshot depuis l'état actuel (`BACKFILL`).
  Le rendu ne change pas.
- **Écart de montant (D1 à D3) ou devis modifié (D4)** → la pièce est marquée
  **`A_REVOIR`** : le client est figé (brique B), mais **ses lignes ne sont
  pas figées** tant que Vanda n'a pas comparé avec l'original. Son rendu reste
  celui d'aujourd'hui (en direct), totaux figés inchangés. Décision de Vanda,
  pièce par pièce :
  1. l'original correspond au devis actuel → snapshot normal ;
  2. le devis a été modifié après coup → Vanda le remet dans l'état de
     l'original (ou fournit les lignes de l'original), puis snapshot ;
  3. l'original lui-même était faux → avoir + nouvelle facture (procédure
     normale, hors backfill).
- **Client modifié (D5)** → voir la décision n° 3 au § 7.

Tant qu'une pièce est `A_REVOIR`, son devis reste protégé par les verrous
actuels (§ 6.1).

### 2.4 Exécution

- Script de données séparé de la migration, **dry-run** par défaut,
  transaction par pièce, idempotent (ignore une pièce déjà figée).
- Entrée dans `docs/DATA-OPERATIONS.md` + AuditLog
  `FACTURE_SNAPSHOT_BACKFILL` par pièce (source, écarts constatés).
- **Contrôle automatique** : avant le backfill, rendu du PDF de chaque pièce
  émise (en direct) ; après, rendu depuis le snapshot ; comparaison du texte
  extrait des deux PDF. Doit être identique pour toutes les pièces
  `BACKFILL` (les pièces `A_REVOIR` ne changent pas : toujours rendues en
  direct jusqu'à décision).

---

## 3. Sauvegarde et retour arrière (point 2)

### 3.1 Avant chaque migration et avant le backfill : branche Neon

Outil principal, parce qu'il ne dépend pas du réseau local (le réseau
d'entreprise coupe le TLS Postgres vers Neon, diagnostiqué en août) :

1. Console Neon → projet ProdBill → **Branches** → **Create branch**.
2. Parent : la branche de production, à l'instant présent.
3. Nom : `pre-immuabilite-<etape>-<AAAA-MM-JJ>` (ex.
   `pre-immuabilite-AB-migration-2026-11-03`, puis
   `pre-immuabilite-backfill-2026-11-04`).
4. Noter le nom dans `docs/DATA-OPERATIONS.md`.

La branche est une copie instantanée (copy-on-write) : rien à télécharger.
Vérifier au passage, dans les réglages du projet, la **fenêtre de
restauration** (history retention) : c'est la seconde ligne de défense
(restauration à un instant donné).

Sauvegarde secondaire, facultative : `npx tsx scripts/backup-full-db.ts`
(pg_dump, fichier dans `backups/`). **À lancer hors réseau d'entreprise**,
sinon il échoue au TLS.

### 3.2 Procédures de retour arrière, du plus léger au plus lourd

| Problème | Retour arrière | Touche à la base ? |
|---|---|---|
| R1 — Code déployé défaillant, schéma correct | Vercel → Deployments → déploiement précédent → **Instant Rollback / Promote to Production**. Les migrations étant additives (tables et colonnes nouvelles, nullable), l'ancien code tourne sur le nouveau schéma. | Non |
| R2 — Backfill erroné | Le backfill n'écrit que dans les tables et colonnes nouvelles : suppression ciblée des snapshots `BACKFILL` / `A_REVOIR` (requête fournie avec le script), puis relance corrigée. Les pièces retombent sur le rendu en direct, comme avant. | Oui, ciblé, sans restauration |
| R3 — Corruption plus large | Console Neon → branche de production → **Restore** depuis la branche `pre-immuabilite-…`. Neon conserve l'état remplacé dans une branche de sauvegarde automatique. Les chaînes de connexion de la production ne changent pas. Puis R1 si le code déployé attend un schéma que la restauration a retiré. | Oui, restauration complète |

À la création de la première branche, **je relève avec toi les intitulés exacts
de la console** et on les recopie ici (je n'ai pas accès à la console : les
libellés ci-dessus sont ceux de la documentation Neon, à confirmer).

---

## 4. Découpage en commits (point 3)

Chaque commit qui porte une migration est **poussé seul**, et rien d'autre
n'est poussé avant ton « Ready ».

| # | Contenu | Migration | Poussé |
|---|---|---|---|
| 1 | **A+B — schéma + écriture à l'émission + lecture avec repli.** Tables `FactureSection` / `FactureLigne`, colonnes client figé + `snapshotSource` / `snapshotAt`. `emettre` et avoir écrivent le snapshot. PDF, page détail, Factur-X, envois, exports lisent le snapshot **s'il existe**, sinon le rendu en direct actuel. | Oui, additive, sans backfill SQL | Seul, branche Neon avant |
| — | **Opération de données** : rapport de détection → décisions de Vanda → branche Neon → backfill → contrôle PDF avant / après. Script et rapport commités avec le tag `[DATA OPERATION]`. | Non | Script poussé après coup (ne change rien au comportement) |
| 2 | **A+B — finalisation** : une pièce émise sans lignes figées et **non marquée `A_REVOIR`** devient une anomalie signalée (plus de repli silencieux) ; test « toute pièce émise est figée ou à revoir ». | Non | Après validation du backfill |
| 3 | **C — verrou métier** (§ 6.1) + **levée du verrou de réordonnancement**. | Non prévue | Seul |
| D | **AuditLog** `DEVIS_CREE`, `DEVIS_UPDATED`, `DEVIS_SUPPRIME`, `FACTURE_UPDATED`, `CLIENT_MODIFIE` (avant / après sur les champs critiques). Ajoutés au fil des commits 1 à 3 dans chaque route touchée ; un dernier commit couvre les routes restantes. | Non (`details` est déjà en JSON) | Avec les commits concernés |

Le commit 1 doit être en production **avant** le backfill : ainsi aucune
pièce émise pendant l'opération n'échappe au snapshot.

---

## 5. Impact par écran et par sortie (point 4)

| Sortie | Aujourd'hui | Après |
|---|---|---|
| **PDF facture / avoir** (routes pdf, envoyer, relancer) | Lignes du devis × ratio, client en direct | Lecture du snapshot ; brouillon inchangé (direct). Rendu identique pour les pièces `BACKFILL`, vérifié par la comparaison automatique. |
| **Page détail facture** | Idem (sections du devis × ratio, client en direct) | Lecture du snapshot. Le lien « Réf. devis » reste (relation conservée). |
| **Facture récap multi-devis** | Liste des devis relue (montant HT net, objet, numéro) | Une ligne figée par devis. Modifier un devis regroupé ne change plus la récap émise. |
| **Factur-X actuel** (profil MINIMUM) | Totaux figés ; nom, adresse et SIRET du client en direct dans le XML ; PDF conteneur en direct | XML : client depuis le snapshot. PDF conteneur : suit le PDF. Pas de lignes en MINIMUM : rien d'autre ne change. |
| **Exports FEC / CSV / Excel** | Nom et SIRET client en direct ; le **compte 411 du FEC est dérivé du SIRET** | Snapshot pour les pièces émises : changer le SIRET d'un client ne réécrit plus les comptes des écritures passées. |
| **Devis, brouillons, suivi budgétaire, dashboard** | — | Aucun changement. |

---

## 6. Ce que le chantier débloque (point 5)

### 6.1 Brique C — le verrou devient une règle métier, plus une protection légale

Une fois les pièces figées, modifier un devis ne touche plus aucune facture
émise. Règle arbitrée (Rose, 29/10) :

- **Déclencheur : une facture ÉMISE** (ou un avoir), jamais un brouillon. Un
  brouillon suit le devis en direct (fix de septembre, #99) : il doit pouvoir
  le suivre. ⚠️ Les verrous actuels (client, réordonnancement :
  `isDevisFactureLocked`) comptent **aussi les brouillons** ; la brique C les
  aligne sur « facture émise ».
- **Le flux acompte puis solde reste possible** : émettre un acompte ne doit
  empêcher ni la création ni l'émission du solde, ni les ajustements que le
  solde absorbe.
- **Réordonnancement des sections : verrou levé** pour toute pièce figée ;
  maintenu tant qu'une pièce liée au devis est `A_REVOIR`.
- **Client** : verrou conservé dès qu'une facture est émise.
- **Montants (lignes, taux, remise)** : proposition à confirmer en session
  (décision n° 4) — bloqués si un **solde** est émis (le devis est entièrement
  facturé et doit rester égal à la somme de ses factures) ; autorisés avec
  bandeau d'avertissement si seuls des acomptes sont émis.
- **Textes (objet, notes, description)** : toujours modifiables.

### 6.2 Réactivation des mails (`MAIL_KILL_SWITCH`)

A+B est **nécessaire mais pas suffisant**. Restent, dans cet ordre :
1. A+B en production et backfill validé (le PDF envoyé est enfin la pièce
   figée) ;
2. **#91** tranché : aujourd'hui l'envoi automatique à l'émission ne part que
   si `pdfUrl` existe, et `pdfUrl` n'est jamais écrit — option 1 (plus de
   dépendance, PDF généré à la volée depuis le snapshot) devient naturelle
   avec A+B ;
3. ticket « Hardening des envois email » (statut métier basculé seulement si
   Resend réussit) ;
4. puis toi : `MAIL_KILL_SWITCH` retiré dans les variables Vercel, premier
   envoi test sur une pièce poubelle.

### 6.3 CONFORMITE-2027

- XML EN 16931 : les lignes de facture (BG-25) se construisent depuis
  `FactureLigne`, l'acheteur depuis le client figé (avec `clientSiren`, figé
  dès le commit 1).
- Ventilation TVA (BG-23) : un seul taux par facture aujourd'hui, lisible sur
  la pièce figée.
- Reste propre au chantier 2027 : PDF/A-3, veraPDF, schematron, nouvelles
  mentions (catégorie d'opération notamment), logo fx.n.

---

## 7. Décisions

| # | Décision | Statut |
|---|---|---|
| 1 | Figer `clientSiren` dès le commit 1 | **Tranché : oui** (Rose, 29/10) |
| 2 | Pièces à montants divergents | **Tranché** : les totaux figés font foi ; pièce marquée `A_REVOIR`, lignes non figées, aucune correction automatique ; décision de Vanda pièce par pièce après comparaison avec l'original (§ 2.3) |
| 3 | Pièces au client modifié (D5) : figer les coordonnées actuelles, ou attendre la confirmation de Vanda pièce par pièce ? | **Ouvert.** Proposition : figer l'état actuel pour celles que Vanda classe « anodin » après comparaison (liste 2) ; pour les « sensibles » (SIRET, raison sociale), elle fournit la valeur de l'original et on fige celle-là |
| 4 | Verrou métier (brique C) | **Tranché en partie** : déclenché par une facture émise, jamais un brouillon ; flux acompte + solde préservé. **Reste à confirmer** : montants bloqués après un solde émis, autorisés avec bandeau après des acomptes seuls (§ 6.1) |
| 5 | Moment du backfill | **Ouvert.** Proposition : un soir, quand personne n'émet de facture, après la décision de Vanda sur les listes 1 et 2 |

## 8. Risques identifiés

- **Rendu différent après backfill** sur une pièce non signalée : couvert par
  la comparaison automatique du texte des PDF avant / après.
- **Double clic sur « Émettre » pendant la transaction** : la garde actuelle
  (passage conditionnel sur BROUILLON) est conservée dans la transaction.
- **Lenteur à l'émission** (création de N lignes) : négligeable aux volumes
  actuels (devis de 5 à 30 lignes).
- **Modification de texte indétectable** (§ 2.2) : risque résiduel assumé et
  écrit dans le rapport.
