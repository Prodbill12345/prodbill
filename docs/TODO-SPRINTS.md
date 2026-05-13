# TODO — Sprints suivants

Suivi des items repérés mais reportés à un sprint ultérieur. Ordonné par
priorité estimée. Mettre à jour le sprint d'affectation quand on tranche.

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
