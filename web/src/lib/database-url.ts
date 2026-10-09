/**
 * URL do Postgres usada pelo app e pelas migrations.
 *
 * Na Vercel, a integração do Neon define DATABASE_URL (pooler PgBouncer em modo
 * transação) e DATABASE_URL_UNPOOLED (conexão direta). Usamos a direta: o pooler
 * descarta parâmetros de sessão (o TimeZone=UTC de lib/db) e não serve para migrations.
 * Para um app de usuário único, conexões diretas sobram. Em dev só existe DATABASE_URL.
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || undefined;
}
