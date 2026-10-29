# TODO — Sprints suivants

Suivi des items repérés mais reportés à un sprint ultérieur. Ordonné par
priorité estimée. Mettre à jour le sprint d'affectation quand on tranche.

---

## Sprint 2 — AuditLog DEVIS_UPDATED + FACTURE_UPDATED

Aujourd'hui les modifs de Devis et Facture ne sont **pas** tracées dans
`AuditLog`. Conséquence : impossible de répondre à « quelles valeurs avait
ce devis hier ? ». Le seul historique disponible est `createdAt`/`updatedAt`
qui dit *quand* sans dire *quoi*.

Pré-requis : ce TODO est apparu suite au BUG #4 — Vanda dit "modif titre
cascade FG/Marge", mais sans AuditLog avant/après on ne peut ni confirmer
ni infirmer côté data.

À ajouter Sprint 2 :

- `POST /api/devis` → AuditLog `action=DEVIS_CREE` avec
  `details: { snapshot: { taux, totaux, sectionsCount } }`
- `PUT /api/devis/[id]` → AuditLog `action=DEVIS_UPDATED` avec
  `details: { before: { tauxFg, tauxMarge, totalHt, sectionsCount }, after: { ... }, changedFields: [...] }`
- `DELETE /api/devis/[id]` → AuditLog `action=DEVIS_SUPPRIME`
- Symétrique sur Facture (`FACTURE_EMISE`, `FACTURE_UPDATED`)
- Permet aussi le rollback automatisé si bug d'écrasement futur

### Acceptance criteria

- Tout PUT sur Devis crée 1 ligne AuditLog avec before/after sur les
  champs critiques (taux, totaux, sectionsCount)
- Le diff est lisible : la liste `changedFields` permet de filtrer
  rapidement les vraies modifs
- Pas de double-log pour les opérations admin déjà loguées (impersonation,
  scripts de repair)

---

## Sprint 3 — Filtres /devis : filtre "Type" + persistance localStorage

Issus du SPRINT 2 (filtres /devis) — items reportés :

### Filtre par "Type" (à clarifier avec Vanda)

Vanda a demandé un filtre "Type" mais le `LigneTag`
(`ARTISTE / TECHNICIEN_HCS / STUDIO / MUSIQUE / AGENT`) est un attribut
des **lignes**, pas du devis. Avant d'implémenter, clarifier avec elle
ce qu'elle entend par "Type" :

- Peut-être : "devis qui contient au moins une voix-off" → filtre sur
  `devis.lignes.some(tag === "ARTISTE")`
- Peut-être : "devis avec studio uniquement" → filtre sur composition
  des lignes
- Peut-être : un champ métier complètement autre (catégorie projet ?)

Si l'implémentation est validée, deux options techniques :
- Option A : ajouter `include: { sections: { include: { lignes: { select: { tag: true } } } } }` côté server SSR → payload ~3-5× plus gros
- Option B : pré-calculer côté serveur un champ dérivé `devis._hasTags: LigneTag[]` envoyé minimaliste au client

### Persistance localStorage des filtres

Aujourd'hui les filtres sont dans l'URL (cf. SPRINT 2). Si Vanda quitte
et revient, ses filtres sont perdus sauf si elle a bookmarkée la vue.

À ajouter : storage des derniers filtres dans `localStorage` (clé
`prodbill:devis-filters` scopée par companyId), restauré au mount si
l'URL n'en contient pas. Effet de bord à éviter : ne pas mélanger les
filtres de Caleson et NONNA en cas d'impersonation — utiliser
`prodbill:devis-filters:${companyId}` comme clé.

Acceptance criteria :
- URL > localStorage (l'URL reste source de vérité prioritaire)
- Reset explicite : `clearAll()` vide aussi le localStorage
- Indicateur subtil "filtres restaurés depuis ta dernière session" au mount

---

## Sprint 3 — Snapshot client sur Facture (immutabilité légale)

Le modèle `Facture` snapshot les coordonnées de la **Company émettrice**
(`siretEmetteur`, `tvaIntraEmetteur`, `ibanEmetteur`, `adresseEmetteur`,
etc.) mais **PAS** celles du **Client destinataire**. La facture pointe
juste vers `clientId` via FK.

Conséquence : si Vanda modifie un client (via FIX 5 ajouté en Sprint 2)
et qu'on re-génère une facture émise pour ce client, le PDF re-rendu
afficherait les nouvelles coordonnées au lieu des coordonnées
historiques. Or l'art. 289 CGI exige l'immutabilité des mentions
légales post-émission.

Mitigations Phase 2 :

- Soit ajouter sur `Facture` les champs `clientNameSnapshot`,
  `clientSiretSnapshot`, `clientTvaSnapshot`, `clientAddressSnapshot`,
  remplis au moment de l'émission, et faire que `FacturePdf` utilise
  ces snapshots si présents (sinon fallback sur la relation `client`).
- Soit verrouiller l'édition client si une facture EMISE existe
  (refus côté PUT avec 409) — plus strict mais simple.
- Soit accepter le risque et documenter pour l'utilisateur que les
  modifications client n'impactent que les futurs documents — pour
  les anciens, le PDF déposé sur Vercel Blob est l'unique source de
  vérité (déjà immutable comme fichier).

À discuter avec Vanda et un expert-comptable avant de trancher.

---

## Sprint 2 — UX : auto-pré-sélection agent depuis comédien (DevisBuilder)

Quand l'utilisateur sélectionne un comédien dans le dropdown d'une ligne
ARTISTE, et que ce comédien a un agent associé (`comedien.agentId !== null`),
auto-pré-sélectionner le même agent dans le dropdown agent de la ligne.

Cas edge à gérer :
- Comédien sans agent (« à son compte ») → laisser le dropdown agent vide,
  ne pas auto-sélectionner. C'est le cas validé par le BUG #3 (commit
  `fix(devis): convertit "" en null/undefined pour comedienId et agentId`).
- L'utilisateur modifie manuellement l'agent après auto-sélection → respecter
  son choix, ne pas l'écraser au prochain re-render.
- Changement de comédien → mettre à jour l'agent en conséquence, sauf si
  l'utilisateur a explicitement modifié manuellement (flag interne).

Implémentation possible : `useEffect` sur `watch(comedienId)` qui setValue
l'agent correspondant, gated par un état `agentManuallySet`.

---

## Sprint 2 — Verrou métier devis (facture émise)

Aujourd'hui, `PUT /api/devis/[id]` accepte une modification sur tout devis,
quel que soit son statut (`BROUILLON`, `ENVOYE`, `ACCEPTE`, `REFUSE`,
`EXPIRE`) et qu'une facture ait été émise ou non depuis ce devis. Le
commentaire ligne 82 du fichier route dit "est éditable" mais ne vérifie
rien.

Cas réel discuté : Vanda doit pouvoir corriger un devis `ACCEPTE` qui
n'a pas encore été facturé (typo, ajustement client). C'est pourquoi on
ne lock pas sur le statut seul.

À étudier en Sprint 2 :

- Verrou si `devis.factures.some(f => f.statut !== "BROUILLON")` → renvoyer
  409 Conflict avec message clair côté UI
- Permettre uniquement la modification des champs "safe" (objet, notes,
  refDevis, nomProjet, annee) si une facture est émise ; bloquer les
  changements de lignes/taux/remise qui altèreraient la cohérence
  facture ↔ devis (cf. TODO immuabilité art. 289 CGI déjà tagué dans
  `prisma/schema.prisma`)
- Alternative plus stricte : dupliquer les lignes en `FactureSection` /
  `FactureLigne` au moment de l'émission, comme indiqué dans le TODO
  schema, pour découpler définitivement

### Acceptance criteria

- Devis sans facture : éditable comme aujourd'hui (zéro régression)
- Devis avec ≥ 1 facture émise : champs critiques (sections, taux,
  remise) refusés en PUT → 409 + UI affiche un bandeau "Ce devis a
  généré une facture, modifications limitées"
- Tests intégration couvrant les 2 cas

---

## Sprint 3 ou 4 — Hardening des envois email (Resend)

Issu de l'audit lecture seule effectué le 2026-05-13. Conclusions :
ProdBill possède 4 endpoints POST qui envoient des emails vers le
**client final** (`Client.email`). Tous sont déclenchés manuellement
par un bouton UI authentifié — aucun cron, webhook ou side-effect
automatique. Risque actuel : MOYEN (pas de chemin invisible vers Resend
trouvé). Mitigations à implémenter pour passer en LOW.

### Endpoints concernés
- `POST /api/devis/[id]/envoyer` — sendDevisEmail
- `POST /api/factures/[id]/emettre` — sendFactureEmail (transition BROUILLON → EMISE)
- `POST /api/factures/[id]/envoyer` — sendRelanceEmail("ENVOI") (envoi initial post-émission)
- `POST /api/factures/[id]/relancer` — sendRelanceEmail (RELANCE_1 / RELANCE_2 / MISE_EN_DEMEURE)

Wrapper central : `src/lib/email/resend.ts`.

### Items à traiter

1. **Modal de confirmation UI avant chaque envoi**
   - Afficher l'email cible (`client.email`) avant le POST
   - Cohérent côté fiche devis (`/devis/[id]`) et fiche facture (`/factures/[id]`)
   - Pas de fix backend nécessaire — uniquement front

2. **AuditLog systématique des envois Resend (succès ET échec)**
   - Wrap `sendDevisEmail` / `sendFactureEmail` / `sendRelanceEmail` :
     - try/catch sur `resend.emails.send()`
     - Créer `AuditLog action=EMAIL_ENVOI_RESEND` avec
       `details: { success, errorMessage?, resendMessageId?, recipientEmail, templateType }`
   - Le statut métier (DEVIS_ENVOYE, FACTURE_EMISE…) bascule SEULEMENT si l'envoi réussit
   - Sinon : laisser le statut, renvoyer 502 au client, afficher toast d'erreur

3. **Env var `DEV_REDIRECT_EMAIL`**
   - Aujourd'hui `resolveTo()` redirige TOUT vers `roselaine.touati@live.fr` en dev
   - Permettre une override par variable d'env pour tester avec d'autres adresses
   - Documenter dans `.env.example`

4. **Queue avec retry + alerte admin (optionnel, gros sujet)**
   - Trigger.dev ou Bull
   - 3 retry exponentiels en cas d'échec Resend
   - Si échec final → AuditLog + email à `ADMIN_EMAILS` (interne, pas client)
   - À évaluer après les 3 items ci-dessus

### Acceptance criteria

- Aucun email Resend n'est envoyé sans :
  - (a) une action utilisateur explicite (clic bouton)
  - (b) une confirmation modal côté UI
  - (c) un AuditLog correspondant en DB (`action=EMAIL_ENVOI_RESEND`)
- Si Resend échoue, le statut métier ne bascule pas et l'utilisateur voit une erreur claire
- Les tests intégration `__tests__/api/factures/relancer.test.ts` (si créés) couvrent le cas Resend KO

---

## Chantier mails (#91) — BUG-FACTURE-PDF-EMAIL-MORT

Repéré le 18/09/2026 en marge de C-FACTURE-PDF-BDC. **À traiter dans le
chantier mails (#91 + DNS + kill-switch), pas avant** : aucun mail ne part
en prod aujourd'hui de toute façon, le bug est donc sans impact immédiat.

### Le constat

`Facture.pdfUrl`, `Facture.facturxUrl` et `Devis.pdfUrl` ne sont **écrits
nulle part** dans le code. Les PDF sont générés à la volée par les routes
`/api/*/[id]/pdf` et streamés en réponse ; rien ne les persiste sur Vercel
Blob, donc ces trois colonnes valent NULL pour toutes les pièces (hors
imports éventuels).

Or deux envois d'email sont conditionnés à ces colonnes :

- `POST /api/devis/[id]/envoyer` → `if (devis.pdfUrl && devis.client.email)`
  encadre **tout** l'appel `sendDevisEmail()`
- `POST /api/factures/[id]/emettre` → `if (facture.pdfUrl && facture.client.email)`
  encadre **tout** l'appel `sendFactureEmail()`

Conséquence : ces deux branches sont mortes. Le devis passe en ENVOYE et la
facture est émise (avec numéro, immuabilité, AuditLog — tout le reste est
correct), mais **aucun mail n'est jamais tenté**. Ce n'est pas « le mail part
sans le PDF », c'est « le mail ne part pas ». `sendDevisEmail` et
`sendFactureEmail` n'ont qu'un seul appelant chacune : ce sont donc deux
templates Resend entièrement morts en production.

Le silence est total : pas d'erreur, pas de log, et `AuditLog DEVIS_ENVOYE` /
`FACTURE_EMISE` est écrit dans tous les cas — il affirme donc un envoi qui n'a
pas eu lieu.

### Ce qui n'est PAS concerné

Le bouton « Envoyer par email » de la fiche facture
(`POST /api/factures/[id]/envoyer`) et les relances passent par
`sendRelanceEmail()` et **ne dépendent pas de `pdfUrl`**. Ces chemins-là sont
fonctionnels (sous réserve du kill-switch et du DNS). C'est vraisemblablement
pourquoi le bug est passé inaperçu : le chemin manuel, le seul réellement
utilisé par Vanda, marche.

### Deux options, à trancher dans #91

1. **Supprimer la dépendance** (recommandé) : aligner les deux routes sur le
   modèle de `sendRelanceEmail` — plus de `pdfUrl` en paramètre, le client
   récupère sa pièce via un lien vers l'app ou une PJ générée à la volée.
   Les colonnes `pdfUrl` / `facturxUrl` deviennent alors supprimables par
   migration.
2. **Persister réellement le PDF** : `put()` sur Vercel Blob à l'émission,
   écriture de `pdfUrl`. Plus lourd, mais c'est ce qu'appelle l'archivage
   légal 10 ans (cf. CLAUDE.md § Sécurité & conformité) — donc à arbitrer
   avec ce besoin, pas isolément.

À noter : l'archivage 10 ans suppose de toute façon un PDF figé quelque part.
Ce ticket recoupe donc SNAPSHOT-FACTURE-LIGNES (figer les lignes à
l'émission) — les deux décident « ce qu'on fige et où » et gagnent à être
tranchés ensemble.

### Acceptance criteria

- Émettre une facture avec un client qui a un email déclenche une tentative
  d'envoi réelle (ou un skip explicite si kill-switch), jamais un no-op muet
- Idem pour l'envoi d'un devis
- Si aucun envoi n'a lieu, l'AuditLog le dit (`emailSkipped: true` + raison)
  au lieu d'affirmer implicitement le contraire
- Plus aucune branche d'envoi conditionnée à une colonne jamais écrite
- Si l'option 1 est retenue : migration de suppression de `pdfUrl` /
  `facturxUrl`, ou commentaire de schéma expliquant pourquoi elles restent

---

## Chantier CONFORMITE-2027 — Facturation électronique (réforme)

Ouvert le 20/10/2026 (validé par Vanda sur le principe, arbitrage option A
de FEAT-FACTURX-LOGO-MENTION). **Échéance réglementaire : 1er septembre
2027. Cible de déploiement : printemps 2027.** Plan complet à faire dans une
session dédiée — ce ticket ne fixe que le périmètre.

### Point de départ (après FIX-FACTURX-TVA, option C)

La route `GET /api/factures/[id]/facturx` produit aujourd'hui un PDF
react-pdf + XML CII **profil MINIMUM** attaché via pdf-lib. Ce n'est **ni
EN 16931, ni PDF/A-3**. L'option C a seulement rendu le fichier honnête :
bloc TVA réel (catégorie S/E + taux snapshot `tauxTva`), plus aucune
mention « EN 16931 » dans les métadonnées, mention sobre « Facture
disponible au format Factur-X » (sans profil) en pied du PDF classique
des pièces émises. **Pas de logo fx.n** tant que ce chantier n'est pas livré.

### Périmètre (chantier unique, les briques dépendent les unes des autres)

1. **SNAPSHOT-FACTURE-LIGNES — prérequis.** Le XML EN 16931 doit se
   construire sur des lignes figées à l'émission, pas relues depuis le
   devis source (cf. TODO schéma `Facture` + art. 289 CGI). À faire en
   premier.
   *Verrous à lever ensuite :* tant que les lignes ne sont pas figées, le
   réordonnancement des sections d'un devis est **bloqué dès qu'une facture
   (mono ou récap) y est liée** (C-DEVIS-SECTIONS-REORDER, 29/10/2026 —
   `isDevisFactureLocked` dans `src/lib/devis-sections.ts`, refus 400 dans
   `PUT /api/devis/[id]`, poignée désactivée dans le DevisBuilder), sinon le
   PDF d'une facture déjà émise changerait d'ordre. Une fois les sections et
   lignes snapshotées à l'émission, ce blocage pourra être levé (le devis
   pourra être réordonné sans toucher aux pièces émises).
2. **XML EN 16931 complet** : profil `urn:cen.eu:en16931:2017`, lignes de
   facture (BG-25), ventilation TVA par taux/catégorie (BG-23), conditions
   et date d'échéance réelles, validation XSD + schematron officiels.
3. **PDF/A-3** : métadonnées XMP (pdfaid + extension schema Factur-X),
   OutputIntent sRGB (profil ICC), polices intégralement embarquées,
   pièce jointe `factur-x.xml` conforme (AFRelationship), validation
   **veraPDF** en CI ou au moins en test.
4. **Nouvelles mentions obligatoires de la réforme (4)** — liste à
   confirmer sur le texte officiel au moment du plan : SIREN du client,
   adresse de livraison si différente de l'adresse de facturation,
   **catégorie d'opération (biens / services / mixte)** — absente du
   modèle aujourd'hui, migration Prisma à prévoir —, option pour le
   paiement de la TVA d'après les débits le cas échéant.
5. **Logo officiel Factur-X du profil** (fx.n pour EN 16931) sur le
   conteneur, asset officiel FNFE-MPE (fnfe-mpe.org), conditions d'usage
   à vérifier — et seulement une fois 2 et 3 validés. Mention du pied de
   page alors complétée en « (EN 16931) ».

### Écarts repérés dans le XML actuel (à reprendre dans le point 2)

- `TypeCode` toujours 380 : un avoir devrait être 381
- Date d'échéance = date d'émission (ignore `dateEcheance`)
- SIRET émis en `SpecifiedTaxRegistration schemeID="FC"` : à remplacer par
  `SpecifiedLegalOrganization` (schemeID 0002) — à confirmer au schematron
- Taux 0 % : tout part en catégorie E (motif = `tvaMention`, texte libre).
  Autoliquidation (AE), intracom (K), export (G) non distingués → passer
  la mention TVA d'un texte libre à une valeur structurée
- B2B uniquement par principe ; tous les clients Caleson/NONNA sont des
  professionnels → aucune condition B2C à coder pour l'instant

### Acceptance criteria

- Factur-X EN 16931 d'une facture émise validé par veraPDF (PDF/A-3) et par
  le schematron EN 16931 / Factur-X, sur facture mono, récap, acompte,
  solde et avoir
- XML construit exclusivement depuis les lignes snapshotées
- Les 4 mentions de la réforme présentes sur le PDF et dans le XML
- Logo fx.n présent sur le conteneur Factur-X, absent du PDF classique
  et des brouillons

---

## Après C-REDESIGN-PHASE2-APP — Listes mobiles en cartes

Ouvert le 27/10/2026 (arbitrage Rose : ticket séparé, après l'étape 6 —
c'est de la restructuration, pas de l'habillage).

Sur téléphone, les listes (devis, factures, paiements, clients…) sont des
tableaux en défilement horizontal depuis l'étape 4 du redesign : utilisable
mais pas confortable pour Vanda. Cible : sous `md`, une carte par ligne
(numéro + client + montant + badge de statut, actions en bas de carte),
le tableau restant tel quel au-dessus de `md`.

### Acceptance criteria

- Devis, factures, paiements : lisibles et actionnables à 390 px sans
  défilement horizontal
- Mêmes données, filtres, tris et sélection (récap multi-devis) qu'en
  tableau — aucune régression fonctionnelle
- Le tableau desktop est inchangé

---

## Après C-REDESIGN-PHASE2-APP — C-PDF-ACCENT-PAR-COMPANY

Ouvert le 27/10/2026 (demande Vanda, arbitrage Rose : après l'étape 6).

Permettre à chaque société de choisir la couleur d'accent de ses
documents clients (PDF devis / facture / avoir / conteneur Factur-X), au
lieu du bleu signature unique. Aujourd'hui l'accent des PDF vient de
`colors.accent` (src/design/tokens.ts) : numéro du document, libellés de
section en capitales espacées, total final.

### Périmètre

- Champ `accentColor` sur `Company` (migration additive, nullable ;
  NULL = bleu signature actuel, rendu inchangé).
- Palette CURÉE de 4-5 accents (pas de sélecteur libre), chacun testé :
  AA sur crème (≥ 4.5 — texte du numéro et des libellés) et assez
  distinct de l'encre #25251F pour rester un accent. Candidats mesurés le
  27/10 (contraste sur crème · contraste vs encre) :
  Klein #2115ED (8.0 · 1.76), Bordeaux #8A1F2D (8.3 · 1.70),
  Vert sapin #1F5A3D (7.4 · 1.90), Pétrole #0E5A6B (7.2 · 1.98),
  Prune #5B2A6E (9.6 · 1.47). Écartés : Wine #5E1A1A (1.20 vs encre)
  et Olive #3A3D2B (1.38) — AA mais trop proches de l'encre, l'accent ne
  se distingue plus du texte (cf. aperçus « variantes-accent » du 27/10).
  Liste finale à valider par Rose + Vanda sur rendu PDF réel.
- Templates DevisPdf / FacturePdf : accent lu depuis la société (devis :
  `company` ; facture : à snapshotter à l'émission comme les autres
  mentions émetteur, pour qu'un changement d'accent ne modifie pas le
  rendu d'une pièce émise — cf. immuabilité).
- Choix dans Paramètres : pastilles de la palette + aperçu en direct.

### Dépendance

Découpler d'abord les tons sémantiques des badges de l'accent de marque
(voir reco « variantes d'accent » : `statusTones.info` ne doit plus
dériver de `colors.accent`). Sans ça, un accent bordeaux fait ressembler
« Envoyé » à une alerte. Concerne l'app ; les PDF n'ont pas de badges de
statut mais le même principe s'applique au repli des tons.

### Acceptance criteria

- Société sans accent choisi : PDF identiques au pixel près à aujourd'hui
- Chaque accent de la palette : test AA automatisé sur crème
- Facture émise : l'accent est figé (changer l'accent de la société ne
  change pas le PDF d'une pièce déjà émise)
- Caleson et NONNA : rendu vérifié à l'œil (devis, facture, avoir)

---
