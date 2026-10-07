/**
 * Rate limit de tentativas de login em memória. Suficiente para um app de usuário
 * único rodando em uma instância; reiniciar o servidor zera os contadores.
 */
type Entry = { count: number; windowStart: number };

export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}) {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 10_000;
  const entries = new Map<string, Entry>();

  function current(key: string): Entry | undefined {
    const e = entries.get(key);
    if (e && now() - e.windowStart >= opts.windowMs) {
      entries.delete(key);
      return undefined;
    }
    return e;
  }

  return {
    check(key: string): { allowed: boolean; retryAfterMs: number } {
      const e = current(key);
      if (!e || e.count < opts.max) return { allowed: true, retryAfterMs: 0 };
      return { allowed: false, retryAfterMs: opts.windowMs - (now() - e.windowStart) };
    },
    fail(key: string) {
      const e = current(key);
      if (e) {
        e.count += 1;
        return;
      }
      if (entries.size >= maxKeys) {
        // Descarta a entrada mais antiga (Map preserva a ordem de inserção).
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { count: 1, windowStart: now() });
    },
    reset(key: string) {
      entries.delete(key);
    },
    size: () => entries.size,
  };
}
