# Journal des opérations data — ProdBill

Chaque entrée recense une opération d'écriture **hors flux applicatif normal**
exécutée directement sur la base prod : repair script, migration manuelle,
backfill, etc. Le commit git associé porte le tag `[DATA OPERATION]`.

Format : antéchronologique (le plus récent en haut).

---

## 2026-05-13 — Rectification totalHt brut post-import historique

**Type** : script TypeScript transactionnel (`scripts/repair-devis-totalHt.ts`)
**Opérateur** : `roselaine.touati@live.fr` (attribué via `--admin-email`)
**Périmètre** : 31 devis + 7 factures Caleson (NONNA : 0)

### Justification

Le script d'import historique exécuté en avril 2026 sur le workspace Caleson
écrasait le champ `Devis.totalHt` (BRUT) avec la valeur de `totalApresRemise`
(NET) sur tous les devis présentant une remise correctement saisie. La même
corruption a été propagée sur la table `Facture` au moment de l'émission des
factures issues de ces devis. Détail technique : voir `docs/MULTITENANT.md` /
section sur Caleson — N/A, mais reproduit ici pour archive.

**Pattern (sous-pattern A)** :
- `Devis.totalHt == Devis.totalApresRemise` (NET stocké à la place du BRUT)
- `Devis.remise == |Σ composantes − totalHt|` à 0,01 € près
- Composantes (`sousTotal`, `csComedien`, `csTechniciens`, `fraisGeneraux`,
  `marge`) intactes et cohérentes

Hors scope :
- 11 devis sub-pattern B (`remise == 0` + ∆ significatif, cause inconnue)
- 10 devis suspect_delta_positif (`∆ > 0`, divergence inverse)
- 4 devis rounding (`|∆| < 1 €`, artefacts flottants légitimes)

### Ventilation par workspace

| Workspace | Devis rectifiés | Factures rectifiées |
|---|---|---|
| **Caleson** | 31 | 7 (6 EMISE + 1 PAYEE) |
| **NONNA Post-Production** | 0 | 0 |
| **Total** | **31** | **7** |

### Opération exacte

Pour chaque devis :
```sql
UPDATE "Devis"
SET totalHt = sousTotal + csComedien + csTechniciens
            + fraisGeneraux + marge - coproduction
WHERE id = <id>;
```

Pour chaque facture associée : même `UPDATE` sur `Facture.totalHt`.

**Champs strictement NON modifiés** : `totalApresRemise`, `tva`, `totalTtc`,
`remise`, `coproduction`, `sousTotal`, `csComedien`, `csTechniciens`,
`fraisGeneraux`, `marge`, ainsi que toutes les relations.

### Impact PDFs émis aux clients

**Aucun impact côté client**. Les PDFs déjà déposés sur Vercel Blob avant
émission restent sur disque, intacts. Pour les générations futures (après
correction d'affichage commit `5d00372`) :
- L'affichage `TOTAL HT` sur le PDF facture est calculé à la volée
  comme `totalHt − remise` → équivalent au `totalApresRemise` du devis
- Avant repair : `totalHt = NET`, donc affichage = `NET − remise` (incohérent)
- Après repair : `totalHt = BRUT`, affichage = `BRUT − remise` = `NET` (correct)
- → l'affichage post-repair correspond exactement à la valeur qui était
  envoyée aux clients dans le PDF original. Pas de divergence.

Les valeurs `totalTtc` et `tva` stockées sur la facture sont restées
inchangées et correctes tout au long de l'opération.

### Traçabilité AuditLog

7 lignes `AuditLog` créées (action `FACTURE_TOTAUX_RECTIFIE_ADMIN`) :
- Range IDs : `cmp47m93r00009f3xnywylzoe` → `cmp47m9us00069f3xeokisnkx`
- Horodatage : 2026-05-13 15:23:48–49 UTC
- Détails : `{ reason, before, after, impactClient: false, pdfClientInchange: true, devisId, devisNumero }`
- `userId` = Prisma User ID de `roselaine.touati@live.fr`
- `userName` = `[ADMIN roselaine.touati@live.fr] script-repair`

Liste par facture :

| Facture | Devis source | Client | Statut | AuditLog ID |
|---|---|---|---|---|
| 26056 | 26029 | BAVARDAGES PRODUCTION | **PAYEE** ⚠️ | `cmp47m93r00009f3xnywylzoe` |
| 26105 | 26003 | CHANGE | EMISE | `cmp47m99b00019f3xtvl62u2o` |
| 26043 | 26136 | GRINTA | EMISE | `cmp47m9l900029f3xwozt9uwo` |
| 26080 | 26157 | WNP | EMISE | `cmp47m9mz00039f3xv6orrwba` |
| 26088 | 26169 | BIRTH | EMISE | `cmp47m9ol00049f3xxa88prq2` |
| 26099 | 26195 | RAYMONDE | EMISE | `cmp47m9q200059f3xev4ldnjr` |
| 26092 | 26211 | CHANGE | EMISE | `cmp47m9us00069f3xeokisnkx` |

### Protections

- Transaction Prisma globale (rollback en bloc en cas d'échec)
- Sanity check pré-exécution : `expectedTotalHt = storedTotalHt + remise` à 0,01 € près
- Sanity check intra-transaction post-update : 0 cas pattern A résiduel exigé, sinon `throw` → rollback automatique
- Mode dry-run par défaut, `--commit` obligatoire pour exécuter

### Action de communication

La facture **26056 PAYEE** (BAVARDAGES PRODUCTION, ∆ +148,05 €) doit être
remontée prioritairement au client Caleson (Vanda) car elle modifie une
facture déjà encaissée. Le client a été payé sur la base du `totalTtc`
inchangé — pas d'impact commercial, mais transparence légale requise.

### Commits associés

- `5d00372` — fix(factures): TOTAL HT affiche totalHt - remise (parité Devis)
- (le commit chore(scripts) + fix(data) qui suivent immédiatement)

---
