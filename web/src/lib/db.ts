import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/database-url";

// Uma instância por processo; em dev o HMR recarrega módulos, então guardamos no globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida");
  }
  // O adapter-pg desloca timestamptz quando o TimeZone da sessão não é UTC;
  // forçamos UTC por conexão (a exibição converte para São Paulo em lib/format).
  const adapter = new PrismaPg({ connectionString, options: "-c TimeZone=UTC" });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
