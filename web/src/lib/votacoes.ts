import "server-only";
import { db } from "@/lib/db";

export type VotoCategoria =
  | "sim"
  | "nao"
  | "nao_votou"
  | "ausente"
  | "ausente_plenario"
  | "ausente_votacao";

export const VOTO_LABEL: Record<string, string> = {
  sim: "Favorável",
  nao: "Contrário",
  nao_votou: "Não votou",
  ausente: "Ausente",
  ausente_plenario: "Ausente do plenário",
  ausente_votacao: "Ausente na votação",
};

export type Placar = { sim: number; nao: number; outros: number };

function placarDe(votos: { voto: string }[]): Placar {
  const p: Placar = { sim: 0, nao: 0, outros: 0 };
  for (const { voto } of votos) {
    if (voto === "sim") p.sim++;
    else if (voto === "nao") p.nao++;
    else p.outros++;
  }
  return p;
}

const ORDEM_VOTO = ["sim", "nao", "nao_votou", "ausente_votacao", "ausente_plenario", "ausente"];

export async function getVotacoesDaSessao(sessaoId: number) {
  const rows = await db.votacao.findMany({
    where: { sessaoId },
    orderBy: [{ ordem: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    select: {
      id: true,
      ordem: true,
      descricao: true,
      legenda: true,
      autoria: true,
      assunto: true,
      resultado: true,
      tipoAprovacao: true,
      votos: {
        select: {
          voto: true,
          vereador: { select: { id: true, nomeParlamentar: true } },
        },
      },
    },
  });
  return rows.map(({ votos, ...v }) => ({
    ...v,
    placar: placarDe(votos),
    votos: votos
      .map((x) => ({ vereadorId: x.vereador.id, nomeParlamentar: x.vereador.nomeParlamentar, voto: x.voto }))
      .sort(
        (a, b) =>
          ORDEM_VOTO.indexOf(a.voto) - ORDEM_VOTO.indexOf(b.voto) ||
          a.nomeParlamentar.localeCompare(b.nomeParlamentar, "pt-BR"),
      ),
  }));
}

export type VotacaoDetalhe = Awaited<ReturnType<typeof getVotacoesDaSessao>>[number];

export async function getPresencasDaSessao(sessaoId: number) {
  const rows = await db.sessaoPresenca.findMany({
    where: { sessaoId },
    select: {
      presente: true,
      situacao: true,
      vereador: { select: { id: true, nomeParlamentar: true } },
    },
  });
  // PENDENTE = registro ainda não fechado no boletim: nem presente, nem ausente.
  const pendentes = rows.filter((r) => r.situacao === "PENDENTE").length;
  const ausentes = rows
    .filter((r) => !r.presente && r.situacao !== "PENDENTE")
    .map((r) => ({ id: r.vereador.id, nomeParlamentar: r.vereador.nomeParlamentar, situacao: r.situacao }))
    .sort((a, b) => a.nomeParlamentar.localeCompare(b.nomeParlamentar, "pt-BR"));
  return {
    total: rows.length - pendentes,
    presentes: rows.length - pendentes - ausentes.length,
    pendentes,
    ausentes,
  };
}

export async function getResumoVereador(vereadorId: number, limiteVotos = 20) {
  const [presencas, contagem, votos] = await Promise.all([
    db.sessaoPresenca.groupBy({
      by: ["presente"],
      // OR explícito: "situacao <> 'PENDENTE'" sozinho descartaria as linhas com situacao NULL.
      where: { vereadorId, OR: [{ situacao: null }, { situacao: { not: "PENDENTE" } }] },
      _count: { _all: true },
    }),
    db.voto.groupBy({ by: ["voto"], where: { vereadorId }, _count: { _all: true } }),
    db.voto.findMany({
      where: { vereadorId },
      orderBy: [
        { votacao: { sessao: { dataInicio: "desc" } } },
        { votacao: { ordem: { sort: "desc", nulls: "last" } } },
      ],
      take: limiteVotos,
      select: {
        voto: true,
        votacao: {
          select: {
            id: true,
            descricao: true,
            resultado: true,
            sessao: { select: { id: true, dataInicio: true } },
          },
        },
      },
    }),
  ]);

  const total = presencas.reduce((n, p) => n + p._count._all, 0);
  const presentes = presencas.find((p) => p.presente)?._count._all ?? 0;

  const porVoto = (voto: string) => contagem.find((c) => c.voto === voto)?._count._all ?? 0;
  const totalVotos = contagem.reduce((n, c) => n + c._count._all, 0);

  return {
    presenca: total === 0 ? null : { presentes, total, percentual: Math.round((presentes / total) * 100) },
    contagem: {
      sim: porVoto("sim"),
      nao: porVoto("nao"),
      outros: totalVotos - porVoto("sim") - porVoto("nao"),
    } satisfies Placar,
    votosRecentes: votos.map((v) => ({
      votacaoId: v.votacao.id,
      descricao: v.votacao.descricao,
      resultado: v.votacao.resultado,
      sessaoId: v.votacao.sessao.id,
      data: v.votacao.sessao.dataInicio,
      voto: v.voto,
    })),
  };
}
