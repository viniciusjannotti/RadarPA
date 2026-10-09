import "server-only";
import { db } from "@/lib/db";

/**
 * Rate limit de tentativas de login guardado no Postgres. Em serverless (Vercel) cada
 * instância teria o próprio contador em memória; no banco o limite vale para todas.
 * O relógio é o do banco (now()), o mesmo para qualquer instância.
 */
export type LoginLimiter = {
  check(key: string): Promise<{ allowed: boolean; retryAfterMs: number }>;
  fail(key: string): Promise<void>;
  reset(key: string): Promise<void>;
};

export function createDbRateLimiter(opts: { max: number; windowMs: number }): LoginLimiter {
  const windowSecs = opts.windowMs / 1000;

  return {
    async check(key) {
      const rows = await db.$queryRaw<{ contagem: number; restante_ms: number }[]>`
        SELECT contagem,
               EXTRACT(EPOCH FROM inicio + make_interval(secs => ${windowSecs}) - now())::float8 * 1000
                 AS restante_ms
        FROM login_tentativas
        WHERE chave = ${key} AND inicio > now() - make_interval(secs => ${windowSecs})`;
      const e = rows[0];
      if (!e || e.contagem < opts.max) return { allowed: true, retryAfterMs: 0 };
      return { allowed: false, retryAfterMs: Math.max(0, Math.round(e.restante_ms)) };
    },

    async fail(key) {
      // Upsert atômico: falhas simultâneas somam; janela vencida recomeça em 1.
      await db.$executeRaw`
        INSERT INTO login_tentativas (chave, contagem, inicio)
        VALUES (${key}, 1, now())
        ON CONFLICT (chave) DO UPDATE SET
          contagem = CASE
            WHEN login_tentativas.inicio <= now() - make_interval(secs => ${windowSecs}) THEN 1
            ELSE login_tentativas.contagem + 1 END,
          inicio = CASE
            WHEN login_tentativas.inicio <= now() - make_interval(secs => ${windowSecs}) THEN now()
            ELSE login_tentativas.inicio END`;
      await db.$executeRaw`
        DELETE FROM login_tentativas
        WHERE inicio <= now() - make_interval(secs => ${windowSecs})`;
    },

    async reset(key) {
      await db.$executeRaw`DELETE FROM login_tentativas WHERE chave = ${key}`;
    },
  };
}

export const loginLimiter = createDbRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
