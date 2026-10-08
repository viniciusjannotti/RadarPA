import { describe, expect, it } from "vitest";
import { getDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db";

const AGORA = new Date("2026-10-08T21:00:00Z"); // quinta 08/10, 18:00 em SP

async function seed() {
  const sessao = (numero: number, tipo: string, iso: string, fim?: string) =>
    db.sessao.create({
      data: {
        numero,
        ano: 2026,
        tipo,
        dataInicio: new Date(iso),
        dataFim: fim ? new Date(fim) : null,
        fonteUrl: "x",
      },
    });
  await sessao(35, "Sessão Ordinária", "2026-09-29T19:00:00Z");
  const ultima = await sessao(36, "Sessão Ordinária", "2026-10-06T19:00:00Z", "2026-10-06T22:02:00Z");
  const v = await db.vereador.create({
    data: { nome: "Ana", nomeParlamentar: "Ana", partido: "X", fonteUrl: "x" },
  });
  await db.votacao.createMany({
    data: [1, 2, 3].map((i) => ({ sessaoId: ultima.id, descricao: `Item ${i}`, fonteUrl: "x" })),
  });
  await db.sessaoPresenca.create({
    data: { sessaoId: ultima.id, vereadorId: v.id, presente: true, situacao: "PRESENTE", fonteUrl: "x" },
  });
  const prop = (numero: number, data: string) =>
    db.proposicao.create({
      data: { tipo: "Indicação", numero, ano: 2026, titulo: `Indicação Nº ${numero}/2026`, dataProtocolo: new Date(data), fonteUrl: "x" },
    });
  await prop(1, "2026-10-07");
  await prop(2, "2026-10-02");
  await prop(3, "2026-09-01"); // fora da semana
  for (let i = 1; i <= 7; i++) {
    await db.noticia.create({
      data: {
        titulo: `Notícia ${i}`,
        url: `https://www.pousoalegre.mg.leg.br/n${i}`,
        dataPublicacao: new Date(Date.UTC(2026, 9, i)),
        fonteUrl: "x",
      },
    });
  }
  await db.coletaLog.createMany({
    data: [
      { coletor: "collector_sessoes", inicio: new Date("2026-10-08T09:00:00Z"), fim: new Date("2026-10-08T09:01:00Z"), status: "sucesso" },
      { coletor: "collector_votacoes", inicio: new Date("2026-10-08T09:02:00Z"), fim: new Date("2026-10-08T09:03:00Z"), status: "erro" },
      { coletor: "collector_votacoes", inicio: new Date("2026-10-07T09:02:00Z"), fim: new Date("2026-10-07T09:03:00Z"), status: "sucesso" },
    ],
  });
  return { ultima };
}

describe("getDashboard", () => {
  it("monta última sessão, novidades, notícias e saúde da coleta", async () => {
    const { ultima } = await seed();
    const d = await getDashboard(AGORA);

    expect(d.ultimaSessao).toMatchObject({ id: ultima.id, numero: 36, votacoes: 3, presentes: 1, totalPresenca: 1 });
    expect(d.novidades.proposicoesSemana).toBe(2);
    expect(d.noticias.map((n) => n.titulo)).toEqual([
      "Notícia 7",
      "Notícia 6",
      "Notícia 5",
      "Notícia 4",
      "Notícia 3",
    ]);
    // Última coleta com sucesso (a das 09:03 deu erro e não conta).
    expect(d.coleta.ultimaAtualizacao?.toISOString()).toBe("2026-10-08T09:01:00.000Z");
    // Só a execução mais recente de cada coletor conta.
    expect(d.coleta.comProblema).toEqual(["collector_votacoes"]);
  });

  it("sem sessão futura cadastrada, prevê a próxima terça no horário da última ordinária", async () => {
    await seed();
    const d = await getDashboard(AGORA);
    expect(d.proximaSessao).toEqual({
      data: new Date("2026-10-13T19:00:00Z"),
      confirmada: false,
      sessaoId: null,
    });
  });

  it("sessão futura cadastrada é a próxima, confirmada", async () => {
    await seed();
    const futura = await db.sessao.create({
      data: { numero: 7, ano: 2026, tipo: "Sessão Extraordinária", dataInicio: new Date("2026-10-09T17:00:00Z"), fonteUrl: "x" },
    });
    const d = await getDashboard(AGORA);
    expect(d.proximaSessao).toEqual({ data: futura.dataInicio, confirmada: true, sessaoId: futura.id });
  });

  it("banco vazio não quebra", async () => {
    const d = await getDashboard(AGORA);
    expect(d.ultimaSessao).toBeNull();
    expect(d.proximaSessao).toBeNull();
    expect(d.noticias).toEqual([]);
    expect(d.coleta.ultimaAtualizacao).toBeNull();
  });
});

describe("getDashboard (precisão)", () => {
  it("'dados atualizados' considera só execuções com sucesso", async () => {
    await db.coletaLog.createMany({
      data: [
        { coletor: "collector_sessoes", inicio: new Date("2026-10-07T09:00:00Z"), fim: new Date("2026-10-07T09:01:00Z"), status: "sucesso" },
        { coletor: "collector_votacoes", inicio: new Date("2026-10-08T09:00:00Z"), fim: new Date("2026-10-08T09:05:00Z"), status: "erro" },
      ],
    });
    const d = await getDashboard(AGORA);
    expect(d.coleta.ultimaAtualizacao?.toISOString()).toBe("2026-10-07T09:01:00.000Z");
    expect(d.coleta.comProblema).toEqual(["collector_votacoes"]);
  });

  it("'últimos 7 dias' são 7 dias do calendário de São Paulo, incluindo hoje", async () => {
    const prop = (numero: number, data: string) =>
      db.proposicao.create({
        data: { tipo: "Indicação", numero, ano: 2026, titulo: `Indicação Nº ${numero}/2026`, dataProtocolo: new Date(data), fonteUrl: "x" },
      });
    await prop(1, "2026-10-02"); // 6 dias antes de 08/10 → entra
    await prop(2, "2026-10-01"); // 7 dias antes → fora
    await prop(3, "2026-10-08"); // hoje → entra
    // 08/10 às 23:30 em SP já é 09/10 em UTC: "hoje" continua sendo 08/10.
    const d = await getDashboard(new Date("2026-10-09T02:30:00Z"));
    expect(d.novidades.proposicoesSemana).toBe(2);
  });
});
