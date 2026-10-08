import { describe, expect, it } from "vitest";
import { escaparLike, normalizarConsulta, numeroDaConsulta, termosDaConsulta } from "@/lib/busca-texto";

describe("normalizarConsulta", () => {
  it("minúsculas, sem acento, espaços colapsados, tamanho limitado", () => {
    expect(normalizarConsulta("  Assédio   MORAL ")).toBe("assedio moral");
    expect(normalizarConsulta("Dionísio")).toBe("dionisio");
    expect(normalizarConsulta("x".repeat(300))).toHaveLength(100);
  });
});

describe("termosDaConsulta", () => {
  it("separa em até 5 termos com 2+ caracteres", () => {
    expect(termosDaConsulta("assedio moral a b")).toEqual(["assedio", "moral"]);
    expect(termosDaConsulta("a b c d e f g h")).toEqual([]);
    expect(termosDaConsulta("um dois tres quatro cinco seis")).toHaveLength(5);
  });
});

describe("numeroDaConsulta", () => {
  it("reconhece número e número/ano", () => {
    expect(numeroDaConsulta("8412/2026")).toEqual({ numero: 8412, ano: 2026 });
    expect(numeroDaConsulta("8412")).toEqual({ numero: 8412 });
    expect(numeroDaConsulta("lei 8412")).toBeNull();
  });
});

describe("escaparLike", () => {
  it("neutraliza curingas digitados pelo usuário", () => {
    expect(escaparLike("100%_\\")).toBe("100\\%\\_\\\\");
  });
});

describe("robustez", () => {
  it("caracteres de controle (ex.: NUL, que o Postgres rejeita) viram espaço", () => {
    expect(normalizarConsulta("ab\u0000cd\u200Bef")).toBe("ab cd ef");
  });

  it("entrada gigante é cortada antes de normalizar", () => {
    expect(normalizarConsulta("é".repeat(100_000))).toBe("e".repeat(100));
  });
});

// Mesmas entradas/saídas de collectors/tests/test_collector_proposicoes.py
// (test_paridade_da_normalizacao_com_a_web): o coletor grava, a web consulta.
export const PARIDADE: [string, string][] = [
  ["ASSÉDIO", "assedio"],
  ["Ação Nº 5", "acao nº 5"],
  ["CONCESSÃO à ÇÉU", "concessao a ceu"],
  ["1ª Sessão", "1ª sessao"],
  ["Lívia Ü", "livia u"],
];

describe("paridade com o coletor Python", () => {
  it.each(PARIDADE)("%s → %s", (entrada, esperado) => {
    expect(normalizarConsulta(entrada)).toBe(esperado);
  });
});
