import { describe, expect, it } from "vitest";
import { ehAbstencao, ehDivergente, maioriaDe } from "@/lib/ia/divergencia";

const votos = (...vs: string[]) => vs.map((voto) => ({ voto }));

describe("ehAbstencao", () => {
  it("presente na sessão mas sem voto = abstenção; faltas não são", () => {
    expect(ehAbstencao("nao_votou")).toBe(true);
    expect(ehAbstencao("ausente_plenario")).toBe(true);
    expect(ehAbstencao("ausente")).toBe(false);
    expect(ehAbstencao("ausente_votacao")).toBe(false);
    expect(ehAbstencao("sim")).toBe(false);
  });
});

describe("maioriaDe", () => {
  it("sim × não, com abstenção valendo meio voto contrário", () => {
    expect(maioriaDe(votos("sim", "sim", "nao", "ausente", "ausente", "ausente"))).toBe("sim");
    expect(maioriaDe(votos("nao", "nao", "sim"))).toBe("nao");
    // 2 sim × 1 não + 2 abstenções (= 2 contrários): empate.
    expect(maioriaDe(votos("sim", "sim", "nao", "nao_votou", "ausente_plenario"))).toBeNull();
    // 2 sim × 1 não + 3 abstenções (= 2,5 contrários): maioria contrária.
    expect(maioriaDe(votos("sim", "sim", "nao", "nao_votou", "nao_votou", "nao_votou"))).toBe("nao");
  });

  it("faltas não pesam; empate ou nenhum voto efetivo não tem maioria", () => {
    expect(maioriaDe(votos("sim", "nao", "ausente", "ausente_votacao"))).toBeNull();
    expect(maioriaDe(votos("ausente", "ausente_votacao"))).toBeNull();
    expect(maioriaDe([])).toBeNull();
  });
});

describe("ehDivergente", () => {
  it("voto sim/não contra a maioria", () => {
    expect(ehDivergente("nao", votos("sim", "sim", "nao"))).toBe(true);
    expect(ehDivergente("sim", votos("sim", "sim", "nao"))).toBe(false);
  });

  it("abstenção diverge de maioria favorável, mas não de maioria contrária", () => {
    expect(ehDivergente("nao_votou", votos("sim", "sim", "sim", "nao_votou"))).toBe(true);
    expect(ehDivergente("ausente_plenario", votos("sim", "sim", "sim", "ausente_plenario"))).toBe(true);
    expect(ehDivergente("nao_votou", votos("nao", "nao", "nao_votou"))).toBe(false);
  });

  it("faltas e empates nunca são divergência", () => {
    expect(ehDivergente("ausente", votos("sim", "sim", "ausente"))).toBe(false);
    expect(ehDivergente("ausente_votacao", votos("sim", "sim", "ausente_votacao"))).toBe(false);
    expect(ehDivergente("sim", votos("sim", "nao"))).toBe(false);
  });
});
