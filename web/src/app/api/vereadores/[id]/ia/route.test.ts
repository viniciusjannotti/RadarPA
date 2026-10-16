import { beforeEach, describe, expect, it, vi } from "vitest";

let logado = true;
vi.mock("@/lib/auth/session", () => ({ hasValidSession: async () => logado }));

const montarContexto = vi.fn();
vi.mock("@/lib/ia/contexto-vereador", () => ({ montarContexto }));

const gerarTexto = vi.fn();
let configurada = true;
vi.mock("@/lib/ia/gemini", () => ({
  IANaoConfiguradaError: class extends Error {},
  iaConfigurada: () => configurada,
  gerarTexto,
}));

const { POST } = await import("./route");

const chamar = (id: string, body: unknown) =>
  POST(
    new Request(`http://x.test/api/vereadores/${id}/ia`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  logado = true;
  configurada = true;
  montarContexto.mockReset().mockResolvedValue("## DADOS DO VEREADOR\nNome parlamentar: Ana");
  gerarTexto.mockReset().mockResolvedValue("**Resumo** da Ana");
});

describe("POST /api/vereadores/[id]/ia", () => {
  it("401 sem sessão, sem chamar a IA", async () => {
    logado = false;
    expect((await chamar("1", { modo: "resumo" })).status).toBe(401);
    expect(gerarTexto).not.toHaveBeenCalled();
  });

  it("503 quando a chave não está configurada", async () => {
    configurada = false;
    expect((await chamar("1", { modo: "resumo" })).status).toBe(503);
  });

  it("400 para id, JSON ou pedido inválidos", async () => {
    expect((await chamar("abc", { modo: "resumo" })).status).toBe(400);
    expect((await chamar("1", "{não é json")).status).toBe(400);
    expect((await chamar("1", { modo: "apagar" })).status).toBe(400);
    expect(gerarTexto).not.toHaveBeenCalled();
  });

  it("404 para vereador inexistente", async () => {
    montarContexto.mockResolvedValue(null);
    expect((await chamar("9", { modo: "resumo" })).status).toBe(404);
  });

  it("resumo: dados cercados na instrução e resposta sem cache", async () => {
    const res = await chamar("1", { modo: "resumo" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ texto: "**Resumo** da Ana" });

    const [instrucao, mensagens] = gerarTexto.mock.calls[0];
    expect(montarContexto).toHaveBeenCalledWith(1);
    expect(instrucao).toContain("<dados>\n## DADOS DO VEREADOR\nNome parlamentar: Ana\n</dados>");
    expect(mensagens).toEqual([{ papel: "user", texto: expect.any(String) }]);
  });

  it("chat: envia histórico + pergunta nessa ordem", async () => {
    await chamar("1", {
      modo: "chat",
      pergunta: "E saúde?",
      historico: [
        { papel: "user", texto: "oi" },
        { papel: "model", texto: "olá" },
      ],
    });
    expect(gerarTexto.mock.calls[0][1]).toEqual([
      { papel: "user", texto: "oi" },
      { papel: "model", texto: "olá" },
      { papel: "user", texto: "E saúde?" },
    ]);
  });

  it("502 quando a IA falha ou não devolve texto, sem vazar o erro", async () => {
    gerarTexto.mockRejectedValueOnce(new Error("chave XYZ inválida"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await chamar("1", { modo: "divergentes" });
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("XYZ");

    gerarTexto.mockResolvedValueOnce(null);
    expect((await chamar("1", { modo: "resumo" })).status).toBe(502);
  });
});
