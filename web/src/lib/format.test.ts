import { describe, expect, it } from "vitest";
import { formatData, formatDataCivil, formatDataHora, formatHora, tipoCurto } from "@/lib/format";

// 06/10/2026 16:00 em São Paulo (UTC-3)
const inicio = new Date("2026-10-06T19:00:00Z");

describe("format", () => {
  it("formata data no fuso de São Paulo, independente do fuso do servidor", () => {
    expect(formatData(inicio)).toBe("06/10/2026");
    // 01:30 UTC ainda é dia 06 em São Paulo
    expect(formatData(new Date("2026-10-07T01:30:00Z"))).toBe("06/10/2026");
  });

  it("formata hora e data+hora", () => {
    expect(formatHora(inicio)).toBe("16:00");
    expect(formatDataHora(inicio)).toBe("06/10/2026 16:00");
  });

  it("data civil (@db.Date, meia-noite UTC) não volta um dia no fuso de São Paulo", () => {
    expect(formatDataCivil(new Date("2025-01-01T00:00:00Z"))).toBe("01/01/2025");
    expect(formatDataCivil(new Date("2028-12-31T00:00:00Z"))).toBe("31/12/2028");
    expect(formatDataCivil(null)).toBe("—");
  });

  it("devolve travessão para datas ausentes", () => {
    expect(formatHora(null)).toBe("—");
  });

  it("abrevia o tipo de sessão", () => {
    expect(tipoCurto("Sessão Ordinária")).toBe("Ordinária");
    expect(tipoCurto("Sessão Extraordinária")).toBe("Extraordinária");
    expect(tipoCurto("Audiência Pública")).toBe("Audiência Pública");
  });
});
