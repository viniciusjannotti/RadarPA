import { describe, expect, it } from "vitest";
import { createDbRateLimiter } from "@/lib/auth/login-limiter";
import { db } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;

describe("rate limiter no banco", () => {
  it("bloqueia após o máximo de falhas na janela, só para aquele IP", async () => {
    const rl = createDbRateLimiter({ max: 3, windowMs: WINDOW_MS });
    expect((await rl.check("1.1.1.1")).allowed).toBe(true);
    await rl.fail("1.1.1.1");
    await rl.fail("1.1.1.1");
    expect((await rl.check("1.1.1.1")).allowed).toBe(true);
    await rl.fail("1.1.1.1");

    const blocked = await rl.check("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(WINDOW_MS - 60_000);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
    expect((await rl.check("2.2.2.2")).allowed).toBe(true);
  });

  it("libera depois que a janela passa e recomeça a contagem", async () => {
    const rl = createDbRateLimiter({ max: 2, windowMs: WINDOW_MS });
    await rl.fail("1.1.1.1");
    await rl.fail("1.1.1.1");
    expect((await rl.check("1.1.1.1")).allowed).toBe(false);

    await db.$executeRaw`UPDATE login_tentativas SET inicio = now() - interval '16 minutes'`;
    expect((await rl.check("1.1.1.1")).allowed).toBe(true);

    // Falha após a janela abre uma janela nova com contagem 1 (não soma às antigas).
    await rl.fail("1.1.1.1");
    expect((await rl.check("1.1.1.1")).allowed).toBe(true);
    const row = await db.loginTentativa.findUniqueOrThrow({ where: { chave: "1.1.1.1" } });
    expect(row.contagem).toBe(1);
  });

  it("zera o contador após sucesso", async () => {
    const rl = createDbRateLimiter({ max: 2, windowMs: WINDOW_MS });
    await rl.fail("1.1.1.1");
    await rl.reset("1.1.1.1");
    await rl.fail("1.1.1.1");
    expect((await rl.check("1.1.1.1")).allowed).toBe(true);
  });

  it("falhas simultâneas não se perdem", async () => {
    const rl = createDbRateLimiter({ max: 5, windowMs: WINDOW_MS });
    await Promise.all(Array.from({ length: 5 }, () => rl.fail("1.1.1.1")));
    expect((await rl.check("1.1.1.1")).allowed).toBe(false);
  });

  it("apaga entradas vencidas de outros IPs (a tabela não cresce sem limite)", async () => {
    const rl = createDbRateLimiter({ max: 5, windowMs: WINDOW_MS });
    await rl.fail("velho");
    await db.$executeRaw`UPDATE login_tentativas SET inicio = now() - interval '1 hour'`;
    await rl.fail("novo");
    const chaves = (await db.loginTentativa.findMany()).map((r) => r.chave);
    expect(chaves).toEqual(["novo"]);
  });
});
