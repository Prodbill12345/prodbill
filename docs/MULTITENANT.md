# Isolation multi-tenant — ProdBill

## Principe

L'isolation des données entre workspaces (Companies) repose sur **deux mécanismes complémentaires** :

1. **Filtre `companyId` direct** : chaque table tenant-scopée porte un champ `companyId` indexé, et toutes les queries Prisma incluent `where: { companyId: user.companyId, ... }`.
2. **Helper `scopedPrisma(companyId)`** (`src/lib/scoped-prisma.ts`) : extension Prisma qui injecte automatiquement le `companyId` sur lectures, créations, updates, deletes et upserts, et qui pré-valide les FK cross-tenant.

Les deux mécanismes coexistent : le filtre manuel est explicite et lisible, le helper apporte une garantie au runtime.

## Règle d'or pour toute nouvelle route ou page

> **OBLIGATOIRE** : toute nouvelle query Prisma sur une table tenant-scopée DOIT filtrer par `user.companyId`.
>
> **RECOMMANDÉ** : utiliser `scopedPrisma(user.companyId)` plutôt que le filtre manuel. Le helper protège contre les oublis et les FK cross-tenant.

```ts
// ✅ RECOMMANDÉ
const db = scopedPrisma(user.companyId);
const devis = await db.devis.findMany({ where: { statut: "ACCEPTE" } });

// ✅ ACCEPTABLE (filtre manuel explicite)
const devis = await prisma.devis.findMany({
  where: { companyId: user.companyId, statut: "ACCEPTE" }
});

// ❌ INTERDIT — fuite cross-tenant
const devis = await prisma.devis.findMany({ where: { statut: "ACCEPTE" } });
```

## Tables tenant-scopées (16)

`Client`, `Comedien`, `Agent`, `Devis`, `Facture`, `DevisSection`, `DevisLigne`, `BDC`, `Paiement`, `BudgetPrevisionnel`, `BudgetLigne`, `Relance`, `Counter`, `AuditLog`, `Document`, `DevisTemplate`.

Hors scope volontaire :
- `User` : Phase 1 garde la relation 1-N. **Phase 2 → table `Membership(userId, companyId, role)` alignée Clerk Organizations.**
- `Company` : le tenant lui-même.

## Helper `scoped-prisma` — comportements

L'extension intercepte les opérations sur les 16 modèles scopés :

| Opération | Comportement |
|---|---|
| `findMany`, `findFirst`, `count`, `aggregate`, `groupBy` | Injecte `where.companyId` |
| `findUnique({ where: { id } })` | Réécrit en `findFirst({ where: { id, companyId } })` |
| `findUnique({ where: { numero } })` sur Facture/BDC | Réécrit en `findUnique({ where: { companyId_numero: { ... } } })` — préserve l'index unique composé |
| `create`, `createMany` | Injecte `data.companyId` + pré-valide les FK (clientId, devisId, …) |
| `update`, `delete`, `updateMany`, `deleteMany`, `upsert` | Injecte `where.companyId` + pré-valide les FK changées |

### Limites connues

- **Nested writes** (`{ create: { lignes: { create: [...] } } }`) ne sont pas couverts par l'extension. Injecter `companyId` explicitement sur chaque niveau, ou utiliser les helpers locaux `scopedSection` / `scopedLigne` / `scopedBudgetLigne` / `scopedPaiement`.
- **`$queryRaw` / `$executeRaw`** ne sont pas interceptables. À vérifier manuellement.
- **`User` n'est pas scopé** — pour fetcher l'utilisateur depuis Clerk, utiliser `prisma` directement (cf. `requireAuth()`).

## Tests d'isolation

Script : `scripts/test-isolation-phase1.ts`.

Couvre 10 scénarios d'attaque cross-tenant :

1. `findMany` cross-workspace → ne remonte que le tenant actif
2. `findUnique` par ID d'un autre tenant → `null`
3. `findUnique` Facture.numero (clé composée) cross-tenant → `null`
4. `update` sur ressource d'un autre tenant → P2025
5. `delete` sur ressource d'un autre tenant → P2025
6. `connect` (FK) cross-tenant → `CrossTenantError`
7. Route `/api/comediens/[id]/projets` cross-tenant → 404
8. Lignes du comédien cross-tenant via `comedienId` → 0 row
9. Page SSR `/devis` ouverte côté Caleson — pas de fuite W2 dans la liste
10. Page SSR `/factures` ouverte côté Workspace 2 — uniquement factures W2

À relancer **après tout refactor majeur** sur les routes ou le schéma :

```bash
npx tsx scripts/test-isolation-phase1.ts
```

## Inventaire des fichiers couverts par Phase 1

### Routes API critiques refactorées (11)

- `/api/devis/route.ts` (POST) — companyId sur nested sections + lignes
- `/api/devis/[id]/route.ts` (PUT) — idem en update
- `/api/devis/[id]/accepter/route.ts` — companyId sur BDC créé
- `/api/paiements/route.ts` — companyId + filtre direct
- `/api/budget/[id]/route.ts` — companyId sur nested BudgetLigne
- `/api/comediens/lignes/[ligneId]/paiement/route.ts` — filtre direct
- `/api/comediens/[id]/projets/route.ts` — refacto vers `scopedPrisma`
- `/api/agents/[id]/route.ts` (DELETE) — `scopedPrisma` (Phase 1.5)
- `/api/comediens/[id]/route.ts` (PUT + DELETE) — `scopedPrisma` (Phase 1.5)
- `/api/export/excel/route.ts` — `scopedPrisma` sur facture/paiement/devis (Phase 1.5)
- `/api/export/fec/route.ts` — `scopedPrisma` sur facture/paiement (Phase 1.5)

### Scripts batch refactorés (4)

- `scripts/import-csv.ts`
- `scripts/import-historique.ts`
- `scripts/restore-from-report.ts`
- `scripts/seed-demo.ts`

### Pages SSR refactorées vers `scopedPrisma` (Phase 1.5)

13 pages serveur dans `src/app/(dashboard)/`, toutes migrées vers `scopedPrisma(user.companyId)` :

- `page.tsx` (dashboard)
- `clients/page.tsx`, `clients/[id]/page.tsx`
- `devis/page.tsx`, `devis/nouveau/page.tsx`, `devis/[id]/page.tsx`, `devis/[id]/modifier/page.tsx`
- `factures/page.tsx`, `factures/[id]/page.tsx`
- `comediens/page.tsx`, `agents/page.tsx`
- `paiements/page.tsx`, `budget/page.tsx`

`parametres/page.tsx` n'utilise pas `scopedPrisma` (lit seulement `user.company` qui est hors scope).

### Routes/pages dont l'isolation tient encore via filtre manuel

Les autres routes API (~25) filtrent par `user.companyId` manuellement (pattern `findFirst({ where: { id, companyId } })`). Fonctionnellement OK ; généralisation possible mais à coût marginal.

## Roadmap

### Phase 1.5 — Defense-in-depth — Done [12 mai 2026]

Généralisation effectuée le 12 mai 2026 :
- 13 pages SSR migrées vers `scopedPrisma`
- 4 routes API précédemment marquées TODO refactorées (`agents/[id]` DELETE, `comediens/[id]` DELETE, `export/excel`, `export/fec`)
- 2 scénarios de test supplémentaires (8 et 9) — passage à 10 scénarios validés

Les fichiers refactorés en Phase 1.5 sont signalés par un commentaire « Phase 1.5 multi-tenant » ou utilisent directement `scopedPrisma(user.companyId)`.

### Phase 2 — Membership N-N

Le `User.companyId` actuel limite chaque user à un seul workspace. Pour le cas "comptable externe accédant à plusieurs clients", refactor :

- Nouveau modèle `Membership { userId, companyId, role }`
- `requireAuth()` lit `auth().orgId` (Clerk Organizations) et résout la `Company` via `Company.clerkOrgId`
- UI : ajouter un switcher d'organisation Clerk

Le `TODO Phase 2` est documenté sur `User.companyId` dans `prisma/schema.prisma`.

## Admin tools — super-admin instance ProdBill

### Accès et whitelist

Les pages `/admin/*` sont protégées par `requireAdmin()` (`src/lib/admin.ts`). La whitelist provient de la variable d'env **`ADMIN_EMAILS`** (liste séparée par virgules, comparaison insensible à la casse).

```env
# .env.local + Vercel (Production + Preview + Development)
ADMIN_EMAILS=roselaine.touati@live.fr,autre@exemple.fr
```

**Non-whitelisté → `notFound()`** (404 Next.js, pas 403). L'objectif est de ne pas révéler l'existence de la route admin aux utilisateurs non autorisés.

### Pages disponibles

| Route | Contenu |
|---|---|
| `/admin/workspaces` | Tableau dense : nom, SIRET, date création, nb users/devis/factures, CA payé, CA en attente |
| `/admin/workspaces/[id]` | Détail Company : configuration, utilisateurs, AuditLog récents, stats |

L'entrée d'accès est un lien `Admin` (icône `Shield`, rouge subtil) ajouté en bas de la `Sidebar` du dashboard — visible **uniquement** si `actor.realEmail ∈ ADMIN_EMAILS`. Le layout admin a son propre header sombre (slate-950) pour signaler le contexte super-admin.

### Mode impersonation

#### Cas d'usage
Permettre à un super-admin de consulter et agir dans un workspace tiers sans toucher à la BD (debug, support, audit).

#### Mécanique
1. Click sur **`⇄ Impersonate`** dans la liste des workspaces → `POST /api/admin/impersonate/start { companyId }`
2. Le serveur :
   - Vérifie `realEmail ∈ ADMIN_EMAILS`
   - Pioche un utilisateur cible dans la Company (priorité `role=ADMIN`, sinon premier user)
   - Pose un cookie **httpOnly** `prodbill_impersonate` (`sameSite=lax`, `secure` en prod, `maxAge=1h`) contenant `{ realClerkId, realEmail, impersonatedUserId, impersonatedCompanyId, startedAt }`
   - Écrit `AuditLog(action=START_IMPERSONATION)` dans la Company impersonée avec `details: { impersonatedBy, impersonatedByClerkId, targetUserId, ... }`
3. Au prochain SSR, `getCurrentUser()` (`src/lib/auth-context.ts`) :
   - Lit le cookie
   - Re-valide que la session Clerk active correspond au `realClerkId` du cookie
   - Re-valide que l'email Clerk est toujours dans `ADMIN_EMAILS`
   - Retourne le **user impersoné** → toutes les pages dashboard (et `scopedPrisma(user.companyId)`) basculent sur les données de la Company cible
4. Le banner rouge `<ImpersonationBanner>` s'affiche en haut du dashboard (`sticky top-0 z-50 bg-red-600`) avec le nom de la company, du user cible, et un bouton `Quitter le mode`
5. Le `<title>` HTML est préfixé `👑 IMPERSONATION — …` via `generateMetadata()` (cf. `src/app/(dashboard)/layout.tsx`)
6. Click sur `Quitter le mode` → `POST /api/admin/impersonate/exit` → AuditLog `EXIT_IMPERSONATION` + cookie supprimé → redirect `/admin/workspaces`

#### Cohérence SSR vs API routes
- **SSR pages** (`(dashboard)/*`) utilisent `getCurrentUser()` → respectent l'impersonation
- **API routes** utilisent `requireAuth()` (`src/lib/auth.ts`) → également patché pour respecter l'impersonation. Les writes pendant l'impersonation se font donc dans le workspace cible, pas dans celui de l'admin.

#### Audit
Tout START / EXIT est tracé dans `AuditLog`. La ligne porte le `userId` cible (FK valide) et `details.impersonatedBy = email-admin` pour identification.

> **Limite Phase 1** : les `AuditLog` écrits *pendant* l'impersonation (création de devis, modif client…) portent le `userId` de la cible mais n'incluent pas systématiquement `details.impersonatedBy`. À étendre Phase 2 si nécessaire (hook au niveau de `prisma.auditLog.create`).

### Defense-in-depth

- Cookie **httpOnly** : non accessible depuis JS, donc immunisé XSS pour exfiltration
- Re-validation server-side à chaque SSR : un cookie volé est inutilisable si l'email Clerk associé n'est plus dans `ADMIN_EMAILS`
- Le cookie expire après **1h** (auto-clear)
- L'API `exit` accepte aussi un caller non-admin et supprime simplement le cookie (utile si l'email a été retiré d'`ADMIN_EMAILS` pendant la session)
