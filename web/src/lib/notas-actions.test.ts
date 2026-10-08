import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n) } : undefined) }),
}));
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const criarNota = vi.fn(async () => ({ id: 1 }));
const editarNota = vi.fn(async () => {});
const apagarNota = vi.fn(async () => {});
vi.mock("@/lib/notas", () => ({ criarNota, editarNota, apagarNota }));

const { criarNotaAction, editarNotaAction, apagarNotaAction } = await import("@/lib/notas-actions");
const { readAuthConfig } = await import("@/lib/auth/config");
const { SESSION_COOKIE, signSession } = await import("@/lib/auth/token");

const ENV = { JWT_SECRET: "s".repeat(48), ADMIN_PASSWORD: "senha-forte-12" };

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
}

describe("notas (Server Actions)", () => {
  beforeEach(async () => {
    vi.stubEnv("JWT_SECRET", ENV.JWT_SECRET);
    vi.stubEnv("ADMIN_PASSWORD", ENV.ADMIN_PASSWORD);
    jar.clear();
    refresh.mockClear();
    criarNota.mockClear();
    editarNota.mockClear();
    apagarNota.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  async function logar() {
    const cfg = readAuthConfig(ENV);
    jar.set(SESSION_COOKIE, await signSession(cfg.secret, cfg.version));
  }

  it("sem sessão nada é gravado", async () => {
    const r = await criarNotaAction(undefined, fd({ tipoAlvo: "vereador", alvoId: "1", texto: "x" }));
    expect(r?.error).toMatch(/sessão/i);
    expect(await editarNotaAction(undefined, fd({ id: "1", texto: "x" }))).toMatchObject({ error: expect.any(String) });
    expect(await apagarNotaAction(undefined, fd({ id: "1" }))).toMatchObject({ error: expect.any(String) });
    expect(criarNota).not.toHaveBeenCalled();
    expect(editarNota).not.toHaveBeenCalled();
    expect(apagarNota).not.toHaveBeenCalled();
  });

  it("com sessão: valida, grava e atualiza a tela", async () => {
    await logar();
    expect(await criarNotaAction(undefined, fd({ tipoAlvo: "vereador", alvoId: "7", texto: "  oi  " }))).toEqual({
      ok: true,
    });
    expect(criarNota).toHaveBeenCalledWith({ tipoAlvo: "vereador", alvoId: 7, texto: "oi" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("entrada inválida volta como erro, sem gravar", async () => {
    await logar();
    const r = await criarNotaAction(undefined, fd({ tipoAlvo: "vereador", alvoId: "7", texto: "   " }));
    expect(r?.error).toBeTruthy();
    expect(criarNota).not.toHaveBeenCalled();
    expect((await apagarNotaAction(undefined, fd({ id: "abc" })))?.error).toBeTruthy();
  });

  it("erro esperado (NotaError) vira mensagem; erro inesperado vira mensagem genérica", async () => {
    await logar();
    const { NotaError } = await import("@/lib/notas-validacao");
    criarNota.mockRejectedValueOnce(new NotaError("Alvo da nota não encontrado."));
    const r = await criarNotaAction(undefined, fd({ tipoAlvo: "vereador", alvoId: "7", texto: "x" }));
    expect(r?.error).toBe("Alvo da nota não encontrado.");

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Mesmo com "não encontrado" no texto, um erro qualquer não vaza para a tela.
    criarNota.mockRejectedValueOnce(new Error("relation não encontrado: segredo interno"));
    const r2 = await criarNotaAction(undefined, fd({ tipoAlvo: "vereador", alvoId: "7", texto: "x" }));
    expect(r2?.error).toBe("Não foi possível salvar. Tente de novo.");
    // O log não leva a mensagem (que pode conter o texto da nota), só nome/código.
    expect(JSON.stringify(spy.mock.calls)).not.toContain("segredo interno");
    spy.mockRestore();
  });
});
