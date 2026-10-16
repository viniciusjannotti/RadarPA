import { describe, expect, it } from "vitest";
import { MAX_HISTORICO, MAX_PERGUNTA, parsePedidoIA } from "@/lib/ia/pedido";

describe("parsePedidoIA", () => {
  it("aceita resumo e divergentes sem mais campos", () => {
    expect(parsePedidoIA({ modo: "resumo" })).toEqual({ ok: true, pedido: { modo: "resumo" } });
    expect(parsePedidoIA({ modo: "divergentes" })).toEqual({
      ok: true,
      pedido: { modo: "divergentes" },
    });
  });

  it("chat exige pergunta e aceita histórico user/model", () => {
    const r = parsePedidoIA({
      modo: "chat",
      pergunta: "  Como votou sobre saúde?  ",
      historico: [
        { papel: "user", texto: "oi" },
        { papel: "model", texto: "olá" },
      ],
    });
    expect(r).toEqual({
      ok: true,
      pedido: {
        modo: "chat",
        pergunta: "Como votou sobre saúde?",
        historico: [
          { papel: "user", texto: "oi" },
          { papel: "model", texto: "olá" },
        ],
      },
    });
    expect(parsePedidoIA({ modo: "chat", pergunta: "e aí?" })).toEqual({
      ok: true,
      pedido: { modo: "chat", pergunta: "e aí?", historico: [] },
    });
    expect(parsePedidoIA({ modo: "chat" }).ok).toBe(false);
  });

  it("rejeita modo desconhecido, corpo inválido e pergunta vazia ou longa", () => {
    expect(parsePedidoIA(null).ok).toBe(false);
    expect(parsePedidoIA("resumo").ok).toBe(false);
    expect(parsePedidoIA({ modo: "apagar" }).ok).toBe(false);
    expect(parsePedidoIA({ modo: "chat", pergunta: "   " }).ok).toBe(false);
    expect(parsePedidoIA({ modo: "chat", pergunta: "x".repeat(MAX_PERGUNTA + 1) }).ok).toBe(false);
  });

  it("rejeita histórico malformado ou longo demais", () => {
    const base = { modo: "chat", pergunta: "ok" };
    expect(parsePedidoIA({ ...base, historico: "x" }).ok).toBe(false);
    expect(parsePedidoIA({ ...base, historico: [{ papel: "system", texto: "x" }] }).ok).toBe(false);
    expect(parsePedidoIA({ ...base, historico: [{ papel: "user", texto: 1 }] }).ok).toBe(false);
    const longo = Array.from({ length: MAX_HISTORICO + 1 }, () => ({ papel: "user", texto: "x" }));
    expect(parsePedidoIA({ ...base, historico: longo }).ok).toBe(false);
  });
});
