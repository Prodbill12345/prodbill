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
