import "dotenv/config";
import { defineConfig } from "prisma/config";

// BUG-AUTOMIGRATE-POOLER-LOCK : en Prisma 7, `datasource` n'accepte plus que
// `url` (et `shadowDatabaseUrl`) — l'ancienne clé `directUrl` était ignorée
// silencieusement, et `prisma migrate deploy` passait par le host -pooler
// (pgbouncer), où l'advisory lock de migration n'est pas fiable.
//
// `url` ne sert qu'à la CLI (migrate, db pull…) : on lui donne la connexion
// DIRECTE. Le runtime n'est pas concerné : PrismaClient passe par l'adapter
// Neon (src/lib/prisma.ts), qui garde DATABASE_URL (pooler).
const directUrl = process.env["DIRECT_URL"];
const pooledUrl = process.env["DATABASE_URL"];

if (!directUrl && pooledUrl?.includes("-pooler")) {
  console.warn(
    "[prisma.config] DIRECT_URL absente : la CLI Prisma utilisera DATABASE_URL (pooler). " +
      "Les migrations risquent un timeout d'advisory lock (P1002)."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: (directUrl || pooledUrl) as string,
  },
});
