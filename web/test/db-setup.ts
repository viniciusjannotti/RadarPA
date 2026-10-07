import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalido");
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
