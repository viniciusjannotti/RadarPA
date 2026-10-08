import "server-only";
import { db } from "@/lib/db";

export async function getProducaoVereador(vereadorId: number, limiteRecentes = 10) {
  const [porTipo, recentes] = await Promise.all([
    db.$queryRaw<{ tipo: string; total: bigint }[]>`
      SELECT p.tipo, count(*) AS total
      FROM proposicao_autores a JOIN proposicoes p ON p.id = a.proposicao_id
      WHERE a.vereador_id = ${vereadorId}
      GROUP BY p.tipo
      ORDER BY total DESC, p.tipo ASC`,
    db.proposicao.findMany({
      where: { autores: { some: { vereadorId } } },
      orderBy: [{ dataProtocolo: { sort: "desc", nulls: "last" } }, { numero: "desc" }],
      take: limiteRecentes,
      select: { id: true, titulo: true, ementa: true, status: true, dataProtocolo: true },
    }),
  ]);
  const tipos = porTipo.map((t) => ({ tipo: t.tipo, total: Number(t.total) }));
  return { total: tipos.reduce((n, t) => n + t.total, 0), porTipo: tipos, recentes };
}

export async function getProposicao(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const p = await db.proposicao.findUnique({
    where: { id },
    select: {
      id: true,
      gwlegisId: true,
      tipo: true,
      numero: true,
      ano: true,
      titulo: true,
      ementa: true,
      status: true,
      dataProtocolo: true,
      link: true,
      autores: {
        select: { vereador: { select: { id: true, nomeParlamentar: true, partido: true } } },
      },
      votacoes: {
        orderBy: { sessao: { dataInicio: "asc" } },
        select: {
          id: true,
          descricao: true,
          resultado: true,
          sessao: { select: { id: true, dataInicio: true } },
        },
      },
    },
  });
  if (!p) return null;
  const { autores, votacoes, ...rest } = p;
  return {
    ...rest,
    autores: autores.map((a) => a.vereador),
    votacoes: votacoes.map(({ sessao, ...v }) => ({ ...v, sessaoId: sessao.id, data: sessao.dataInicio })),
  };
}
