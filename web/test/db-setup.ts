import { afterAll, beforeEach } from "vitest";
import { databaseUrl } from "@/lib/database-url";
import { db } from "@/lib/db";

// Confere a URL que o app vai usar de fato (inclui DATABASE_URL_UNPOOLED, se houver).
const url = new URL(databaseUrl() ?? "postgresql://invalido");
if (url.pathname !== "/radarpa_test" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Testes de banco só rodam contra o banco descartável local. Use `npm test`.");
}

// Limpa todas as tabelas de dados antes de cada teste. Os nomes vêm de pg_tables
// (não de entrada externa) e são citados como identificadores.
beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename.replaceAll('"', '""')}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
});

afterAll(async () => {
  await db.$disconnect();
});
