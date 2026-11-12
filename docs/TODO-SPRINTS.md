# TODO — Sprints suivants

Suivi des items repérés mais reportés à un sprint ultérieur. Ordonné par
priorité estimée. Mettre à jour le sprint d'affectation quand on tranche.

---

## Ordre retenu (29/10/2026, Rose)

1. Auto-sélection de l'agent depuis le comédien (DevisBuilder) — plan
   court avant code.
2. C-PDF-ACCENT-PAR-COMPANY.
3. Chantier IMMUABILITE-FACTURE, en une session dédiée.
4. Le reste de CONFORMITE-2027.

---

## Chantier IMMUABILITE-FACTURE — facture émise immuable (art. 289 CGI)

**Plan détaillé (29/10/2026, à relire) : `docs/PLAN-IMMUABILITE-FACTURE.md`.**

Ouvert le 29/10/2026 (arbitrage Rose) : **session dédiée**, les quatre
tickets ci-dessous sont fusionnés car ils décident ensemble « ce qu'on fige,
où, et qui peut encore modifier quoi ». Prérequis de CONFORMITE-2027 et de
l'activation des mails clients (cf. chantier mails #91, qui gagne à être
tranché en même temps : PDF figé ou non).

### État au 29/10/2026

- Totaux de facture figés à l'émission (#99, `8fd3eab`), rafraîchis tant que
  la facture est BROUILLON.
- Verrous partiels déjà en place, même règle (`isDevisFactureLocked`,
  `src/lib/devis-sections.ts` : facture mono OU récap liée au devis) :
  changement de client (FIX-CLIENT-CHANGE-ENVOYE) et réordonnancement des
  sections (C-DEVIS-SECTIONS-REORDER, refus 400 + poignée désactivée).
- Lignes / sections : relues EN DIRECT sur le devis source → une modif du
  devis après émission change le détail et le PDF d'une pièce émise.
- Client destinataire : relu en direct (pas de snapshot).
- Accent PDF : déjà figé à l'émission (C-PDF-ACCENT-PAR-COMPANY, 29/10/2026 —
  `Facture.pdfAccent`, posé par `emettre` et à la création d'un avoir ; NULL
  = pièce émise avant la fonctionnalité, rendue en Majorelle). Le chantier
  doit le traiter comme les lignes et le client : un snapshot d'émission
  parmi les autres, à garder cohérent (reprise des pièces, verrou, AuditLog).
- Aucun AuditLog sur les modifications de devis / facture.

### Périmètre

#### A. SNAPSHOT-FACTURE-LIGNES — figer sections et lignes à l'émission

Ticket validé par Vanda le 07/09/2026. Tables `FactureSection` /
`FactureLigne` (ou équivalent) remplies à l'émission ; détail facture,
PDF et Factur-X lus depuis ce snapshot, plus depuis `devis.sections`.
Reprise des factures déjà émises : snapshot rétroactif depuis l'état actuel
du devis (à valider : un devis modifié depuis l'émission ne peut pas être
reconstitué — à signaler, pas à deviner).
Inclut le marqueur **« Offert »** des lignes (C-LIGNE-OFFERTE, 02/11/2026) :
`offert` + valeur offerte figés avec la ligne.

**Verrous à lever ensuite :** une fois les lignes figées, le blocage du
réordonnancement des sections d'un devis facturé (C-DEVIS-SECTIONS-REORDER,
29/10/2026) pourra être levé — le devis pourra être réordonné sans toucher
aux pièces émises. Même question pour le reste du verrou (point C).

#### B. Snapshot du client sur la facture

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

#### C. Verrou métier complet du devis facturé

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

##### Acceptance criteria (C)

- Devis sans facture : éditable comme aujourd'hui (zéro régression)
- Devis avec ≥ 1 facture émise : champs critiques (sections, taux,
  remise) refusés en PUT → 409 + UI affiche un bandeau "Ce devis a
  généré une facture, modifications limitées"
- Tests intégration couvrant les 2 cas

#### D. AuditLog DEVIS_UPDATED / FACTURE_UPDATED

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

##### Acceptance criteria (D)

- Tout PUT sur Devis crée 1 ligne AuditLog avec before/after sur les
  champs critiques (taux, totaux, sectionsCount)
- Le diff est lisible : la liste `changedFields` permet de filtrer
  rapidement les vraies modifs
- Pas de double-log pour les opérations admin déjà loguées (impersonation,
  scripts de repair)

### Ordre suggéré dans la session

A (snapshot lignes) et B (snapshot client) d'abord — ils rendent la facture
autonome ; puis C (le verrou peut alors s'assouplir là où le snapshot
protège déjà la pièce) ; D en continu, dès la première route touchée.

---

## Sprint 3 — Filtres /devis : persistance localStorage

Issu du SPRINT 2 (filtres /devis) — item reporté.

*Filtre « Type » : fermé le 29/10/2026.* Le ticket ne précisait pas sur quoi
filtrer (trois hypothèses à clarifier : présence d'une ligne voix-off,
composition des lignes, champ métier inconnu) et Vanda ne se souvient pas
de la demande. À rouvrir seulement sur une demande précise.

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


## Sprint 2 — UX : auto-pré-sélection agent depuis comédien (DevisBuilder)

**Livré le 29/10/2026 (`953d632`)** : `src/lib/agent-preselect.ts`. Règle
retenue : un agent choisi à la main n'est jamais écrasé ; passer à un
comédien à son compte vide un agent rempli automatiquement. Limite : un seul
agent par comédien (voir « Sujet à cadrer — plusieurs agents par comédien »).
Énoncé d'origine ci-dessous.

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

1. **SNAPSHOT-FACTURE-LIGNES — prérequis**, traité dans le chantier
   **IMMUABILITE-FACTURE** (voir plus haut), qui doit être livré avant ce
   chantier : le XML EN 16931 se construit sur des lignes figées à
   l'émission, pas relues depuis le devis source.
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

- **Description du projet en gras (C-DESCRIPTION-GRAS, 02/11/2026)** : stockée
  au format `**gras**`. Le XML actuel ne la reprend pas ; si le XML EN 16931
  l'intègre (note BT-22 par exemple), la passer par `stripBold`
  (`src/lib/text-bold.ts`) : le XML reçoit du texte brut, jamais les marqueurs.

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


## Après C-REDESIGN-PHASE2-APP — C-PDF-ACCENT-PAR-COMPANY

Ouvert le 27/10/2026 (demande Vanda, arbitrage Rose : après l'étape 6).

**Livré le 29/10/2026.** Palette finale (Rose) : Majorelle (défaut),
Bordeaux #962A3A, Olive #5C6B1F, Pétrole #0E6A7A, Encre — wine et olive
éclaircis par rapport aux teintes testées (#5E1A1A / #3A3D2B, lues noires) ;
**Attente fermée le 12/11/2026** : wine et olive éclaircis conservés ; Vanda
a choisi **Majorelle pour Caleson** (valeur par défaut : rien à changer en base).
`Company.pdfAccent` (clé, NULL = Majorelle), `Facture.pdfAccent` figé à
l'émission, réglage « Couleur des documents PDF » dans les Paramètres ;
l'app garde le Majorelle. Le texte ci-dessous est l'énoncé d'origine.

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

## C-LIGNE-OFFERTE — marquer une ligne de devis « Offert » (plan, en attente de Vanda)

Ouvert le 02/11/2026 (demande Vanda). **Plan seulement : on attend le choix
d'affichage de Vanda avant de coder.**

Besoin : une ligne marquée « Offert » garde son prix unitaire affiché mais
contribue **0** au HT, à la TVA, au TTC, à la marge / FG et aux charges
sociales. Mention « Offert » sur le PDF, éventuellement « Valeur offerte » en
bas. Remplace la pratique actuelle « P.U. à 0 » (lignes existantes inchangées,
pas de reprise).

### Modèle

- `DevisLigne.offert Boolean @default(false)` — migration additive, poussée
  seule. Copié par la duplication de devis et stocké dans les modèles (JSON
  `sections` des templates).
- **`DevisLigne.total` = 0 pour une ligne offerte** (montant facturé), la
  valeur offerte (`quantite × prixUnit`, + indexation) étant calculée à
  l'affichage. Raison : le suivi budgétaire et tout ce qui somme `total`
  excluent alors la ligne d'office, sans risque d'oubli. (Alternative écartée :
  garder `total` = valeur et filtrer `offert` partout.)

### Calcul (`src/lib/calculations.ts` — règle métier critique)

- Les lignes offertes sont retirées **à l'entrée** de `calculerDevis` :
  absentes de SOUS_TOTAL_HT, des bases CS (artiste et technicien), de
  BASE_MARGE et des indexations. Un seul point de filtrage.
- Nouvelle sortie `valeurOfferte` (Σ des lignes offertes, indexation
  comprise) pour la mention « Valeur offerte ».
- Cas de référence ajouté aux tests : l'exemple de CLAUDE.md + une ligne
  offerte doit redonner **exactement 4 603,20 € HT**.
- CLAUDE.md (formule) mis à jour avec le flag `offert`, après validation.
- Autres endroits qui calculent `quantite × prixUnit` à auditer : sous-total
  de section (builder, PDF devis, PDF facture), base de la ligne « Agent Voix
  Off (10 %) », prorata des factures acompte / solde.

### Interactions

| Avec | Règle proposée |
|---|---|
| Hors marge / Hors CS | Sans effet sur une ligne offerte (elle ne contribue à rien) : cases grisées quand « Offert » est coché, valeurs conservées (elles reprennent effet si on décoche). |
| Indexation annuelle | Offerte avec la ligne (0 aux totaux, comptée dans la valeur offerte). |
| **Agent Voix Off (10 %)** | **Question pour Vanda** : une ligne artiste offerte entre-t-elle dans la base des 10 % ? Proposition : non (aucun cachet facturé). |
| Facture acompte / solde | Ligne affichée avec la mention « Offert », comme sur le devis ; le prorata ne s'applique qu'aux lignes facturées. |
| Facture récap multi-devis | Montant net par devis : déjà hors lignes offertes. Pas de « valeur offerte » par devis (proposition). |
| Exports FEC / CSV / Excel | Bâtis sur les totaux des pièces : inchangés. |
| Suivi budgétaire | La ligne compte 0 (via `total` = 0). Pas de colonne « valeur offerte » (proposition). |
| Factur-X actuel (MINIMUM) | Pas de lignes dans le XML : rien à faire. |
| Factur-X EN 16931 (CONFORMITE-2027) | Ligne avec prix brut = P.U. (BT-148), remise de ligne à 100 % (BG-27, montant = valeur, motif « Offert »), montant net 0 (BT-131). |
| SNAPSHOT-FACTURE-LIGNES | `FactureLigne.offert` + valeur offerte figés à l'émission (ajouté au plan IMMUABILITE-FACTURE). |

### Affichage — choix de Vanda attendu

- Builder : case « Offert » sur la ligne, comme « Hors marge » ; total de
  ligne et sous-total de section en conséquence.
- PDF (devis et facture), options :
  - **A** — P.U. affiché, colonne Total « Offert » ;
  - **B** — P.U. affiché, total barré + « Offert » ;
  - **C** — P.U. et « 0,00 € » avec une mention « Offert » sous le libellé.
- En option : ligne « Valeur offerte : X € HT » dans le bloc des totaux
  (au-dessus du TOTAL HT, sans effet sur le calcul).

### Tests prévus

Calcul (cas de référence + ligne offerte, offert + hors marge / hors CS,
indexation), base agent selon la décision, payload et duplication, rendu PDF
des 3 options sur un devis réel avant push.

---

## C-DATES-GARDE-FOU — refuser les années aberrantes à la saisie

Ouvert le 12/11/2026 (Rose). Origine : BUG-FACTURE-PERIODE-FIN-INVALIDE
(devis Caleson 26018, fin de période **42027-07-14**, toujours en base).

### Règle

Toute date saisie doit avoir une année dans **[année en cours − 5 ;
année en cours + 10]** (en 2026 : 2021 → 2036). Refus **à la saisie** et
**côté serveur**, message clair : « Année hors plage : saisissez une date
entre 2021 et 2036. »

### Périmètre

- Un helper partagé (`isPlausibleYear` / message unique) remplaçant les
  bornes 1900–2100 actuelles (`PERIODE_YEAR_MIN/MAX` dans
  `src/lib/periode-exploitation.ts`, message dans `src/lib/zod-helpers.ts`).
- Champs : devis (émission, validité, séance, période début / fin), facture
  (date d'émission modifiable, date de règlement, période), paiement (date).
- Saisie : attributs `min` / `max` des `<input type="date">` + validation
  zod du formulaire (le navigateur seul ne suffit pas : saisie clavier).
- Serveur : schémas zod des routes devis, factures (dates), paiements.
- Bornes calculées à l'exécution (pas d'année codée en dur) ; tests aux
  bornes (31/12 de Y−6 refusé, 01/01 de Y−5 accepté, Y+10 accepté, Y+11 refusé).
- Données existantes : non modifiées par ce ticket (une date déjà hors plage
  reste lisible ; seule une nouvelle saisie est bloquée).

### État des données (lecture seule, 12/11/2026)

Liste : `~/Desktop/prodbill-dates-aberrantes.csv`.
- **Hors plage : 1 seule** — devis Caleson 26018, fin de période
  42027-07-14 (à ressaisir par Vanda).
- **Dans la plage mais incohérentes : 36 factures** dont la **date de
  règlement précède la date d'émission** (33 Caleson, 3 NONNA). Pas une
  faute de frappe : ce sont des factures émises dans l'ancien outil puis
  ré-émises dans ProdBill, dont la `dateEmission` est celle de la
  ré-émission (ex. F26002 Caleson : « 05 janvier 2026 » sur l'original,
  11/08/2026 en base). Traité dans IMMUABILITE-FACTURE (plan, contrôle D6),
  pas par ce ticket. Le garde-fou ne bloque pas ce cas.

---

## Sujet à cadrer — plusieurs agents par comédien

Noté le 29/10/2026 (info Vanda, **ne rien coder avant ses précisions**).
Un comédien peut avoir **2 agents**. Aujourd'hui le modèle n'en porte qu'un
(`Comedien.agentId`) et l'auto-pré-sélection du DevisBuilder (`953d632`)
s'appuie dessus.

À cadrer avec Vanda :
- plusieurs agents par comédien (modèle : relation n-n ou agent principal +
  secondaire) ;
- quel agent pré-sélectionner selon le contexte : quel critère décide
  (client, type de prestation, média, territoire… à préciser par Vanda) ;
- comportement si le contexte ne tranche pas (pré-sélection vide ?
  liste restreinte aux agents du comédien ?) ;
- effet sur le suivi budgétaire par agent et sur la ligne « Agent Voix
  Off (10 %) ».

---

## Hors planning (parqué)

Tickets gardés pour mémoire, sans date ni ordre.

### Listes mobiles en cartes

*Parqué le 29/10/2026 : Vanda ne travaille jamais sur téléphone.*

Ouvert le 27/10/2026 (arbitrage Rose : ticket séparé, après l'étape 6 —
c'est de la restructuration, pas de l'habillage).

Sur téléphone, les listes (devis, factures, paiements, clients…) sont des
tableaux en défilement horizontal depuis l'étape 4 du redesign : utilisable
mais pas confortable pour Vanda. Cible : sous `md`, une carte par ligne
(numéro + client + montant + badge de statut, actions en bas de carte),
le tableau restant tel quel au-dessus de `md`.

#### Acceptance criteria

- Devis, factures, paiements : lisibles et actionnables à 390 px sans
  défilement horizontal
- Mêmes données, filtres, tris et sélection (récap multi-devis) qu'en
  tableau — aucune régression fonctionnelle
- Le tableau desktop est inchangé
