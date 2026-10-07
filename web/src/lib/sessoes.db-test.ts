import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getSessao, listSessoes, PAGE_SIZE } from "@/lib/sessoes";

async function criarSessao(numero: number, ano: number, tipo: string, inicio: string | Date) {
  return db.sessao.create({
    data: {
      numero,
      ano,
      tipo,
      dataInicio: new Date(inicio),
      titulo: `${numero}ª ${tipo} de ${ano}`,
      fonteUrl: "https://example.test/export",
    },
  });
}

describe("listSessoes", () => {
  it("lista da mais recente para a mais antiga", async () => {
    await criarSessao(1, 2025, "Sessão Ordinária", "2025-02-04T19:00:00Z");
    await criarSessao(36, 2026, "Sessão Ordinária", "2026-10-06T19:00:00Z");
    await criarSessao(6, 2026, "Sessão Extraordinária", "2026-05-21T17:00:00Z");

    const { items, total } = await listSessoes({});
    expect(total).toBe(3);
    expect(items.map((s) => s.numero)).toEqual([36, 6, 1]);
  });

  it("pagina os resultados", async () => {
    for (let i = 1; i <= PAGE_SIZE + 2; i++) {
      await criarSessao(i, 2026, "Sessão Ordinária", new Date(Date.UTC(2026, 0, i)));
    }
    const p1 = await listSessoes({ page: 1 });
    const p2 = await listSessoes({ page: 2 });
    expect(p1.items).toHaveLength(PAGE_SIZE);
    expect(p2.items).toHaveLength(2);
    expect(p1.totalPages).toBe(2);
  });

  it("filtra por tipo e por ano", async () => {
    await criarSessao(36, 2026, "Sessão Ordinária", "2026-10-06T19:00:00Z");
    await criarSessao(6, 2026, "Sessão Extraordinária", "2026-05-21T17:00:00Z");
    await criarSessao(1, 2025, "Sessão Ordinária", "2025-02-04T19:00:00Z");

    expect((await listSessoes({ tipo: "Sessão Extraordinária" })).total).toBe(1);
    expect((await listSessoes({ ano: 2025 })).items.map((s) => s.numero)).toEqual([1]);
  });

  it("limita a página ao total de páginas", async () => {
    await criarSessao(36, 2026, "Sessão Ordinária", "2026-10-06T19:00:00Z");
    const r = await listSessoes({ page: 9999 });
    expect(r.page).toBe(1);
    expect(r.items).toHaveLength(1);
  });

  it("trata página inválida como página 1", async () => {
    await criarSessao(36, 2026, "Sessão Ordinária", "2026-10-06T19:00:00Z");
    expect((await listSessoes({ page: -3 })).items).toHaveLength(1);
    expect((await listSessoes({ page: Number.NaN })).page).toBe(1);
  });
});

describe("getSessao", () => {
  it("devolve a sessão pelo id", async () => {
    const s = await criarSessao(36, 2026, "Sessão Ordinária", "2026-10-06T19:00:00Z");
    expect((await getSessao(s.id))?.numero).toBe(36);
  });

  it("devolve null para id inexistente ou inválido", async () => {
    expect(await getSessao(999)).toBeNull();
    expect(await getSessao(Number.NaN)).toBeNull();
  });
});
