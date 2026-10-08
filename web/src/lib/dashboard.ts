import "server-only";
import { db } from "@/lib/db";
import { proximaOrdinariaPrevista } from "@/lib/proxima-sessao";

const DIA_MS = 24 * 60 * 60 * 1000;

async function ultimaSessao(agora: Date) {
  const s = await db.sessao.findFirst({
    where: { dataInicio: { lte: agora } },
    orderBy: { dataInicio: "desc" },
    select: {
      id: true,
      numero: true,
      ano: true,
      tipo: true,
      dataInicio: true,
      dataFim: true,
      _count: { select: { votacoes: true } },
    },
  });
  if (!s) return null;
  const presenca = await db.sessaoPresenca.groupBy({
    by: ["presente"],
    where: { sessaoId: s.id, OR: [{ situacao: null }, { situacao: { not: "PENDENTE" } }] },
    _count: { _all: true },
  });
  const { _count, ...rest } = s;
  return {
    ...rest,
    votacoes: _count.votacoes,
    presentes: presenca.find((p) => p.presente)?._count._all ?? 0,
    totalPresenca: presenca.reduce((n, p) => n + p._count._all, 0),
  };
}

async function proximaSessao(agora: Date) {
  const futura = await db.sessao.findFirst({
    where: { dataInicio: { gt: agora } },
    orderBy: { dataInicio: "asc" },
    select: { id: true, dataInicio: true },
  });
  if (futura) return { data: futura.dataInicio, confirmada: true, sessaoId: futura.id };

  const ultimaOrdinaria = await db.sessao.findFirst({
    where: { dataInicio: { lte: agora }, tipo: { contains: "Ordinária" } },
    orderBy: { dataInicio: "desc" },
    select: { dataInicio: true },
  });
  if (!ultimaOrdinaria) return null;
  return {
    data: proximaOrdinariaPrevista(agora, ultimaOrdinaria.dataInicio),
    confirmada: false,
    sessaoId: null,
  };
}

async function saudeDaColeta() {
  // Execução mais recente de cada coletor (uma ainda "executando" esconde a falha
  // anterior até terminar — aceitável: o resultado aparece no fim da execução).
  const [ultimas, [{ ultimoSucesso }]] = await Promise.all([
    db.$queryRaw<{ coletor: string; status: string }[]>`
      SELECT DISTINCT ON (coletor) coletor, status
      FROM coleta_logs ORDER BY coletor, inicio DESC`,
    // "Dados atualizados em" só conta coletas que de fato gravaram dados.
    db.$queryRaw<{ ultimoSucesso: Date | null }[]>`
      SELECT max(fim) AS "ultimoSucesso" FROM coleta_logs WHERE status IN ('sucesso', 'parcial')`,
  ]);
  return {
    ultimaAtualizacao: ultimoSucesso,
    comProblema: ultimas
      .filter((u) => u.status === "erro" || u.status === "interrompido")
      .map((u) => u.coletor)
      .sort(),
  };
}

/** Os últimos `dias` dias do calendário de São Paulo, incluindo hoje, como datas @db.Date. */
function janelaDeDias(agora: Date, dias: number) {
  const hojeSP = new Date(agora.getTime() - 3 * 60 * 60 * 1000); // UTC−3 fixo (sem horário de verão)
  const hoje = Date.UTC(hojeSP.getUTCFullYear(), hojeSP.getUTCMonth(), hojeSP.getUTCDate());
  return { gte: new Date(hoje - (dias - 1) * DIA_MS), lte: new Date(hoje) };
}

export async function getDashboard(agora: Date = new Date()) {
  const [ultima, proxima, proposicoesSemana, noticias, coleta] = await Promise.all([
    ultimaSessao(agora),
    proximaSessao(agora),
    db.proposicao.count({ where: { dataProtocolo: janelaDeDias(agora, 7) } }),
    db.noticia.findMany({
      orderBy: { dataPublicacao: { sort: "desc", nulls: "last" } },
      take: 5,
      select: { id: true, titulo: true, url: true, dataPublicacao: true },
    }),
    saudeDaColeta(),
  ]);
  return {
    ultimaSessao: ultima,
    proximaSessao: proxima,
    novidades: { proposicoesSemana },
    noticias,
    coleta,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
