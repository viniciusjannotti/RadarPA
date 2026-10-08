import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getProducaoVereador, getProposicao } from "@/lib/proposicoes";

async function seed() {
  const ana = await db.vereador.create({
    data: { nome: "Ana", nomeParlamentar: "Ana", partido: "X", fonteUrl: "x" },
  });
  const prop = (tipo: string, numero: number, data: string, extra = {}) =>
    db.proposicao.create({
      data: {
        tipo,
        numero,
        ano: 2026,
        titulo: `${tipo} Nº ${numero}/2026`,
        dataProtocolo: new Date(data),
        fonteUrl: "x",
        ...extra,
      },
    });
  const pl1 = await prop("Projeto de Lei", 1, "2026-02-01", { ementa: "Institui X.", status: "Aprovado" });
  const pl2 = await prop("Projeto de Lei", 2, "2026-03-01");
  const ind = await prop("Indicação", 5, "2026-04-01");
  await prop("Moção", 9, "2026-05-01"); // sem autoria da Ana
  await db.proposicaoAutor.createMany({
    data: [pl1, pl2, ind].map((p) => ({ proposicaoId: p.id, vereadorId: ana.id })),
  });

  const sessao = await db.sessao.create({
    data: { numero: 1, ano: 2026, tipo: "Sessão Ordinária", dataInicio: new Date("2026-02-10T19:00:00Z"), fonteUrl: "x" },
  });
  await db.votacao.create({
    data: {
      sessaoId: sessao.id,
      proposicaoId: pl1.id,
      descricao: "Projeto de Lei Nº 1/2026 — 1ª Votação",
      resultado: "Aprovado",
      fonteUrl: "x",
    },
  });
  return { ana, pl1 };
}

describe("getProducaoVereador", () => {
  it("conta por tipo (mais frequente primeiro) e lista as mais recentes", async () => {
    const { ana } = await seed();
    const p = await getProducaoVereador(ana.id);
    expect(p.total).toBe(3);
    expect(p.porTipo).toEqual([
      { tipo: "Projeto de Lei", total: 2 },
      { tipo: "Indicação", total: 1 },
    ]);
    expect(p.recentes.map((r) => r.titulo)).toEqual([
      "Indicação Nº 5/2026",
      "Projeto de Lei Nº 2/2026",
      "Projeto de Lei Nº 1/2026",
    ]);
  });
});

describe("getProposicao", () => {
  it("traz autores e votações", async () => {
    const { pl1 } = await seed();
    const p = await getProposicao(pl1.id);
    expect(p?.ementa).toBe("Institui X.");
    expect(p?.autores.map((a) => a.nomeParlamentar)).toEqual(["Ana"]);
    expect(p?.votacoes.map((v) => v.descricao)).toEqual(["Projeto de Lei Nº 1/2026 — 1ª Votação"]);
  });

  it("null para id inexistente ou inválido", async () => {
    expect(await getProposicao(999)).toBeNull();
    expect(await getProposicao(-1)).toBeNull();
  });
});
