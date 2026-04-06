@AGENTS.md

# ProdBill — Contexte projet Claude

## Description
SaaS de facturation et gestion financière pour sociétés de production et post-production audiovisuelle et sonore françaises.

## Stack technique
- **Framework** : Next.js 14 (App Router) + TypeScript
- **BDD** : PostgreSQL + Prisma ORM
- **CSS** : Tailwind CSS
- **Auth** : Clerk
- **Emails** : Resend
- **PDF storage** : Vercel Blob
- **PDF generation** : @react-pdf/renderer
- **Factur-X** : XML ZUGFeRD embarqué dans PDF

---

## Règles métier CRITIQUES (ne jamais modifier sans validation)

### Tags de lignes de devis
`COMEDIEN` | `TECHNICIEN_HCS` | `DROIT` | `FORFAIT` | `MATERIEL`

### Formule de calcul (ordre impératif)
```
SOUS_TOTAL_HT     = Σ toutes les lignes (unitaire × quantité)
CS_COMEDIEN       = Σ lignes (COMEDIEN + DROIT) × taux_cs_comedien  [défaut: 57%]
CS_TECHNICIENS    = Σ lignes TECHNICIEN_HCS × taux_cs_tech          [défaut: 65%]
BASE_MARGE        = SOUS_TOTAL_HT + CS_TECHNICIENS                  ⚠️ CS_COMEDIEN EXCLUS
FRAIS_GENERAUX    = BASE_MARGE × taux_fg                            [5% ou 15%]
MARGE             = BASE_MARGE × taux_marge                         [10%, 13% ou 15%]
TOTAL_HT          = SOUS_TOTAL_HT + CS_COMEDIEN + CS_TECHNICIENS + FRAIS_GENERAUX + MARGE
TVA               = TOTAL_HT × 20%
TOTAL_TTC         = TOTAL_HT + TVA
```

### Exemple de validation (cas de test à garder)
```
Lignes:
  - Comédien : 900 € → CS_COMEDIEN = 900 × 57% = 513 €
  - Technicien HCS : 90 € → CS_TECHNICIENS = 90 × 65% = 58,50 €
  - Autres lignes : 2 360 €
  → SOUS_TOTAL_HT = 3 350 €
  → BASE_MARGE = 3 350 + 58,50 = 3 408,50 €
  → FRAIS_GENERAUX (5%) = 3 408,50 × 5% = 170,43 €
  → MARGE (15%) = 3 408,50 × 15% = 511,28 €
  → TOTAL_HT = 3 350 + 513 + 58,50 + 170,43 + 511,28 = 4 603,20 € ✓
```

---

## Numérotation des pièces
- Format : `AA-NNNN` (ex: `25-0042`, `26-0001`)
- Séquentiel par année civile, non modifiable après émission
- Acomptes : `25-0042-A1`, soldes : `25-0042-S1`, avoirs : `AV-25-0042`

## Mentions légales obligatoires (art. L441-9 Code de commerce)
- Numéro séquentiel non modifiable
- SIRET émetteur
- N° TVA intracommunautaire
- Conditions de paiement (délai, mode)
- Pénalités de retard : **15%** par an, exigibles à **45 jours**
- Indemnité forfaitaire recouvrement : **40 €**
- IBAN / BIC

---

## Modules MVP (Phase 1)

### 1. Devis
- Création par sections libres + lignes de prestation
- Calcul temps réel (formule ci-dessus)
- Taux CS/FG/marge configurables par devis (dans les bornes)
- Export PDF + envoi email (Resend)
- Statuts : `BROUILLON` → `ENVOYE` → `ACCEPTE` → `REFUSE` → `EXPIRE`

### 2. Facturation
- Acompte 50% (configurable) généré depuis devis accepté
- Facture de solde
- Avoir (crédit note)
- Export Factur-X (XML ZUGFeRD embarqué dans PDF)
- Factures **non modifiables** après émission (immuabilité légale)

### 3. BDC (Bon de Commande)
- Généré automatiquement depuis devis accepté
- Numérotation séparée : `BDC-25-0042`

### 4. Clients / CRM
- Fiche client complète
- Vérification SIRET via API Sirene INSEE
- Tarification spéciale par client (taux FG/marge personnalisés)
- Historique devis/factures/paiements par client

### 5. Suivi paiements
- Import relevé bancaire CSV / OFX
- Lettrage manuel/automatique
- Alertes retard (> 45 jours)
- Dashboard CA : mensuel, par client, par projet

---

## Rôles utilisateurs
| Rôle | Permissions |
|------|-------------|
| `ADMIN` | Tout + config société + gestion utilisateurs |
| `DIRECTEUR_PROD` | Valide règlements, voit tout |
| `CHARGE_DE_PROD` | Crée/modifie devis, valide devis |
| `COMPTABLE` | Factures, paiements, exports comptables |
| `STAGIAIRE` | Lecture seule + création brouillons |

---

## Sécurité & conformité
- Chiffrement données sensibles (IBAN, données fiscales)
- Archivage légal 10 ans (factures immuables + Vercel Blob)
- RGPD : export/suppression données client
- 2FA obligatoire : `ADMIN`, `DIRECTEUR_PROD`
- Logs d'audit complets (qui a fait quoi, quand)
- Factures non modifiables après statut `EMISE`

---

## UX / Design
- Style : "pro mais sexy" — inspiré Pennylane + Qonto
- Thème neutre avec couleur principale personnalisable par société
- Composants : shadcn/ui + Tailwind
- Responsive (desktop-first)

---

## Architecture multi-tenant
- Isolation par `companyId` sur toutes les tables
- Clerk Organization pour la gestion des équipes
- Chaque société a ses propres séquences de numérotation

---

## Variables d'environnement requises
```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
RESEND_API_KEY=
BLOB_READ_WRITE_TOKEN=
```

---

## Fichiers clés à connaître
- `src/lib/calculations.ts` — Toute la logique de calcul (NE PAS TOUCHER sans tests)
- `src/lib/numbering.ts` — Numérotation séquentielle (transactions DB)
- `prisma/schema.prisma` — Schéma complet
- `src/app/api/` — Routes API Next.js
- `src/components/devis/` — Builder de devis
