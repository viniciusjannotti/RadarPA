import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { apagarNota, criarNota, editarNota, listNotas, listNotasComTotal, notasDoAlvo } from "@/lib/notas";

async function seed() {
  const vereador = await db.vereador.create({
    data: { nome: "Ana", nomeParlamentar: "Ana", partido: "X", fonteUrl: "x" },
  });
  const sessao = await db.sessao.create({
    data: { numero: 36, ano: 2026, tipo: "Sessão Ordinária", dataInicio: new Date("2026-10-06T19:00:00Z"), fonteUrl: "x" },
  });
  const proposicao = await db.proposicao.create({
    data: { tipo: "Projeto de Lei", numero: 8412, ano: 2026, titulo: "Projeto de Lei Nº 8412/2026", fonteUrl: "x" },
  });
  return { vereador, sessao, proposicao };
}

describe("notas", () => {
  it("cria e lista com o rótulo e o link do alvo, mais recentes primeiro", async () => {
    const { vereador, sessao, proposicao } = await seed();
    await criarNota({ tipoAlvo: "vereador", alvoId: vereador.id, texto: "Cobrar resposta" });
    await criarNota({ tipoAlvo: "sessao", alvoId: sessao.id, texto: "Sessão longa" });
    await criarNota({ tipoAlvo: "proposicao", alvoId: proposicao.id, texto: "Acompanhar 2ª votação" });

    const todas = await listNotas({});
    expect(todas.map((n) => [n.texto, n.alvo.rotulo, n.alvo.href])).toEqual([
      ["Acompanhar 2ª votação", "Projeto de Lei Nº 8412/2026", `/proposicoes/${proposicao.id}`],
      ["Sessão longa", "36ª Ordinária de 2026", `/sessoes/${sessao.id}`],
      ["Cobrar resposta", "Ana", `/vereadores/${vereador.id}`],
    ]);
    expect((await listNotas({ tipoAlvo: "sessao" })).map((n) => n.texto)).toEqual(["Sessão longa"]);
  });

  it("não cria nota para alvo inexistente", async () => {
    await seed();
    await expect(criarNota({ tipoAlvo: "vereador", alvoId: 9999, texto: "x" })).rejects.toThrow(
      /não encontrado/,
    );
    expect(await db.notaPessoal.count()).toBe(0);
  });

  it("edita e apaga; notas do alvo vêm só dele", async () => {
    const { vereador, sessao } = await seed();
    const n = await criarNota({ tipoAlvo: "vereador", alvoId: vereador.id, texto: "v1" });
    await criarNota({ tipoAlvo: "sessao", alvoId: sessao.id, texto: "outra" });

    await editarNota(n.id, "v2");
    expect((await notasDoAlvo("vereador", vereador.id)).map((x) => x.texto)).toEqual(["v2"]);

    await apagarNota(n.id);
    expect(await notasDoAlvo("vereador", vereador.id)).toEqual([]);
    expect(await db.notaPessoal.count()).toBe(1);
  });

  it("lista informa quando há mais notas que o limite", async () => {
    const { vereador } = await seed();
    for (let i = 0; i < 3; i++) await criarNota({ tipoAlvo: "vereador", alvoId: vereador.id, texto: `n${i}` });
    const r = await listNotasComTotal({}, 2);
    expect(r.notas).toHaveLength(2);
    expect(r.total).toBe(3);
  });

  it("editar/apagar nota inexistente falha", async () => {
    await expect(editarNota(9999, "x")).rejects.toThrow(/não encontrada/);
    await expect(apagarNota(9999)).rejects.toThrow(/não encontrada/);
  });

  it("nota de alvo que deixou de existir continua listada, sem link", async () => {
    const { proposicao } = await seed();
    await criarNota({ tipoAlvo: "proposicao", alvoId: proposicao.id, texto: "órfã" });
    await db.proposicao.delete({ where: { id: proposicao.id } });
    const [n] = await listNotas({});
    expect(n.alvo).toEqual({ rotulo: "Proposição removida", href: null });
  });
});
