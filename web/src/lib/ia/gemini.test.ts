import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const erroApi = (status: number) => Object.assign(new Error(`api ${status}`), { status });
const msgs = [{ papel: "user" as const, texto: "oi" }];

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "teste");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("GEMINI_MODEL_FALLBACK", "");
  generateContent.mockReset();
});

const { gerarTexto, IASobrecarregadaError } = await import("@/lib/ia/gemini");
const modelosChamados = () => generateContent.mock.calls.map((c) => c[0].model);

describe("gerarTexto", () => {
  it("usa o modelo principal e devolve o texto", async () => {
    generateContent.mockResolvedValue({ text: " resposta " });
    expect(await gerarTexto("sys", msgs)).toBe("resposta");
    expect(modelosChamados()).toEqual(["gemini-3.5-flash"]);
  });

  it("modelo sobrecarregado (503/429/500) cai para o reserva", async () => {
    generateContent.mockRejectedValueOnce(erroApi(503)).mockResolvedValueOnce({ text: "ok" });
    expect(await gerarTexto("sys", msgs)).toBe("ok");
    expect(modelosChamados()).toEqual(["gemini-3.5-flash", "gemini-3.5-flash-lite"]);

    generateContent.mockReset().mockRejectedValueOnce(erroApi(429)).mockResolvedValueOnce({ text: "ok" });
    expect(await gerarTexto("sys", msgs)).toBe("ok");
  });

  it("modelos configuráveis por env", async () => {
    vi.stubEnv("GEMINI_MODEL", "m-principal");
    vi.stubEnv("GEMINI_MODEL_FALLBACK", "m-reserva");
    generateContent.mockRejectedValueOnce(erroApi(503)).mockResolvedValueOnce({ text: "ok" });
    await gerarTexto("sys", msgs);
    expect(modelosChamados()).toEqual(["m-principal", "m-reserva"]);
  });

  it("todos sobrecarregados → IASobrecarregadaError", async () => {
    generateContent.mockRejectedValue(erroApi(503));
    await expect(gerarTexto("sys", msgs)).rejects.toBeInstanceOf(IASobrecarregadaError);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("outros erros (ex.: 400 chave inválida) não tentam o reserva", async () => {
    generateContent.mockRejectedValue(erroApi(400));
    await expect(gerarTexto("sys", msgs)).rejects.toThrow("api 400");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
