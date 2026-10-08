import { describe, expect, it } from "vitest";
import { MAX_TEXTO_NOTA, validarNovaNota, validarTextoNota } from "@/lib/notas-validacao";

describe("validarTextoNota", () => {
  it("apara e aceita texto entre 1 e o máximo", () => {
    expect(validarTextoNota("  lembrar de cobrar  ")).toEqual({ ok: true, texto: "lembrar de cobrar" });
  });

  it("remove NUL (o Postgres rejeita) e recusa surrogate solto", () => {
    expect(validarTextoNota("a\u0000b")).toEqual({ ok: true, texto: "ab" });
    expect(validarTextoNota("x\uD800y").ok).toBe(false);
  });

  it("rejeita vazio, só espaços e texto longo demais", () => {
    expect(validarTextoNota("   ").ok).toBe(false);
    expect(validarTextoNota(null).ok).toBe(false);
    expect(validarTextoNota("x".repeat(MAX_TEXTO_NOTA + 1)).ok).toBe(false);
  });
});

describe("validarNovaNota", () => {
  it("aceita alvo válido", () => {
    expect(validarNovaNota({ tipoAlvo: "vereador", alvoId: "12", texto: "ok" })).toEqual({
      ok: true,
      nota: { tipoAlvo: "vereador", alvoId: 12, texto: "ok" },
    });
  });

  it("rejeita tipo desconhecido e id inválido", () => {
    expect(validarNovaNota({ tipoAlvo: "usuario", alvoId: "1", texto: "x" }).ok).toBe(false);
    expect(validarNovaNota({ tipoAlvo: "sessao", alvoId: "-1", texto: "x" }).ok).toBe(false);
    expect(validarNovaNota({ tipoAlvo: "sessao", alvoId: "1e3", texto: "x" }).ok).toBe(false);
  });
});
