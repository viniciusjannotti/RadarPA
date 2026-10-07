import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getPresencasDaSessao, getResumoVereador, getVotacoesDaSessao } from "@/lib/votacoes";

async function seed() {
  const mk = (nomeParlamentar: string) =>
    db.vereador.create({
      data: { nome: nomeParlamentar, nomeParlamentar, partido: "X", fonteUrl: "x" },
    });
  const [ana, bia, caio] = [await mk("Ana"), await mk("Bia"), await mk("Caio")];
  const sessao = (numero: number, iso: string) =>
    db.sessao.create({
      data: { numero, ano: 2026, tipo: "Sessão Ordinária", dataInicio: new Date(iso), fonteUrl: "x" },
    });
  const s1 = await sessao(1, "2026-02-03T19:00:00Z");
  const s2 = await sessao(2, "2026-02-10T19:00:00Z");

  const votacao = (sessaoId: number, ordem: number, descricao: string) =>
    db.votacao.create({
      data: { sessaoId, ordem, descricao, resultado: "Aprovado", fonteUrl: "x" },
    });
  const v2 = await votacao(s1.id, 2, "Requerimento Nº 2/2026");
  const v1 = await votacao(s1.id, 1, "Projeto de Lei Nº 1/2026 — 1ª Votação");
  const v3 = await votacao(s2.id, 1, "Moção Nº 3/2026");

  await db.voto.createMany({
    data: [
      { votacaoId: v1.id, vereadorId: ana.id, voto: "sim", fonteUrl: "x" },
      { votacaoId: v1.id, vereadorId: bia.id, voto: "nao", fonteUrl: "x" },
      { votacaoId: v1.id, vereadorId: caio.id, voto: "ausente", fonteUrl: "x" },
      { votacaoId: v2.id, vereadorId: ana.id, voto: "sim", fonteUrl: "x" },
      { votacaoId: v3.id, vereadorId: ana.id, voto: "nao", fonteUrl: "x" },
    ],
  });
  await db.sessaoPresenca.createMany({
    data: [
      { sessaoId: s1.id, vereadorId: ana.id, presente: true, situacao: "PRESENTE", fonteUrl: "x" },
      { sessaoId: s1.id, vereadorId: caio.id, presente: false, situacao: "AUSENTE", fonteUrl: "x" },
      { sessaoId: s2.id, vereadorId: ana.id, presente: true, situacao: "PRESENTE", fonteUrl: "x" },
      { sessaoId: s2.id, vereadorId: caio.id, presente: true, situacao: "PRESENTE", fonteUrl: "x" },
    ],
  });
  return { ana, bia, caio, s1, s2 };
}

describe("getVotacoesDaSessao", () => {
  it("lista na ordem da pauta com placar e votos nominais", async () => {
    const { s1 } = await seed();
    const votacoes = await getVotacoesDaSessao(s1.id);
    expect(votacoes.map((v) => v.descricao)).toEqual([
      "Projeto de Lei Nº 1/2026 — 1ª Votação",
      "Requerimento Nº 2/2026",
    ]);
    expect(votacoes[0].placar).toEqual({ sim: 1, nao: 1, outros: 1 });
    expect(votacoes[0].votos.map((v) => [v.nomeParlamentar, v.voto])).toEqual([
      ["Ana", "sim"],
      ["Bia", "nao"],
      ["Caio", "ausente"],
    ]);
  });
});

describe("getPresencasDaSessao", () => {
  it("separa presentes e ausentes", async () => {
    const { s1 } = await seed();
    const p = await getPresencasDaSessao(s1.id);
    expect(p.total).toBe(2);
    expect(p.presentes).toBe(1);
    expect(p.ausentes.map((a) => a.nomeParlamentar)).toEqual(["Caio"]);
  });
});

describe("getResumoVereador", () => {
  it("calcula presença e lista os votos mais recentes primeiro", async () => {
    const { caio, ana } = await seed();
    const rc = await getResumoVereador(caio.id);
    expect(rc.presenca).toEqual({ presentes: 1, total: 2, percentual: 50 });

    const ra = await getResumoVereador(ana.id);
    expect(ra.votosRecentes.map((v) => v.descricao)).toEqual([
      "Moção Nº 3/2026",
      "Requerimento Nº 2/2026",
      "Projeto de Lei Nº 1/2026 — 1ª Votação",
    ]);
    expect(ra.contagem).toEqual({ sim: 2, nao: 1, outros: 0 });
  });

  it("registro PENDENTE não conta como ausência nem entra no total", async () => {
    const { bia, s1 } = await seed();
    await db.sessaoPresenca.create({
      data: { sessaoId: s1.id, vereadorId: bia.id, presente: false, situacao: "PENDENTE", fonteUrl: "x" },
    });
    expect((await getResumoVereador(bia.id)).presenca).toBeNull();
    const p = await getPresencasDaSessao(s1.id);
    expect(p.ausentes.map((a) => a.nomeParlamentar)).toEqual(["Caio"]);
    expect(p.pendentes).toBe(1);
  });

  it("linhas sem situação (NULL) continuam contando", async () => {
    const { bia, s2 } = await seed();
    await db.sessaoPresenca.create({
      data: { sessaoId: s2.id, vereadorId: bia.id, presente: true, situacao: null, fonteUrl: "x" },
    });
    expect((await getResumoVereador(bia.id)).presenca).toEqual({ presentes: 1, total: 1, percentual: 100 });
  });

  it("sem dados, presença nula", async () => {
    const { bia } = await seed();
    expect((await getResumoVereador(bia.id)).presenca).toBeNull();
  });
});
