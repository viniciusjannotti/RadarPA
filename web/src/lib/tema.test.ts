import { describe, expect, it } from "vitest";
import { proximoTema, SCRIPT_TEMA_INICIAL, temaValido } from "@/lib/tema";

describe("tema", () => {
  it("escuro é o padrão; só 'light' vale como claro", () => {
    expect(temaValido(null)).toBe("dark");
    expect(temaValido("qualquer")).toBe("dark");
    expect(temaValido("light")).toBe("light");
  });

  it("alterna entre os dois", () => {
    expect(proximoTema("dark")).toBe("light");
    expect(proximoTema("light")).toBe("dark");
  });

  it("script inicial aplica o tema salvo e não quebra sem localStorage", () => {
    const meta = { content: "#070d1a" };
    const html = { dataset: {} as Record<string, string> };
    const run = (storage: unknown) =>
      new Function("localStorage", "document", SCRIPT_TEMA_INICIAL)(storage, {
        documentElement: html,
        querySelector: () => meta,
      });

    run({ getItem: () => "light" });
    expect(html.dataset.theme).toBe("light");
    expect(meta.content).toBe("#f3f6fb");

    expect(() =>
      run({
        getItem: () => {
          throw new Error("bloqueado");
        },
      }),
    ).not.toThrow();
  });
});
