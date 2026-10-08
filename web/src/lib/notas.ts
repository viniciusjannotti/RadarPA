import "server-only";
import { db } from "@/lib/db";
import { tipoCurto } from "@/lib/format";
import { NotaError, type TipoAlvo } from "@/lib/notas-validacao";

// Sem chave estrangeira (alvo polimórfico): a existência do alvo é checada aqui.
async function alvoExiste(tipo: TipoAlvo, id: number): Promise<boolean> {
  const where = { where: { id } };
  const n =
    tipo === "vereador"
      ? await db.vereador.count(where)
      : tipo === "sessao"
        ? await db.sessao.count(where)
        : await db.proposicao.count(where);
  return n > 0;
}

export async function criarNota(nota: { tipoAlvo: TipoAlvo; alvoId: number; texto: string }) {
  if (!(await alvoExiste(nota.tipoAlvo, nota.alvoId))) {
    throw new NotaError("Alvo da nota não encontrado.");
  }
  return db.notaPessoal.create({ data: nota, select: { id: true } });
}

export async function editarNota(id: number, texto: string) {
  const { count } = await db.notaPessoal.updateMany({ where: { id }, data: { texto } });
  if (count === 0) throw new NotaError("Nota não encontrada.");
}

export async function apagarNota(id: number) {
  const { count } = await db.notaPessoal.deleteMany({ where: { id } });
  if (count === 0) throw new NotaError("Nota não encontrada.");
}

export const LIMITE_NOTAS = 200;

const SELECT_NOTA = { id: true, tipoAlvo: true, alvoId: true, texto: true, criadoEm: true, atualizadoEm: true };

export async function notasDoAlvo(tipoAlvo: TipoAlvo, alvoId: number) {
  return db.notaPessoal.findMany({
    where: { tipoAlvo, alvoId },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    take: LIMITE_NOTAS,
    select: SELECT_NOTA,
  });
}

type Alvo = { rotulo: string; href: string | null };

const REMOVIDO: Record<TipoAlvo, string> = {
  vereador: "Vereador removido",
  sessao: "Sessão removida",
  proposicao: "Proposição removida",
};

/** Rótulo e link de cada alvo, resolvidos em lote (uma consulta por tipo). */
async function resolverAlvos(notas: { tipoAlvo: string; alvoId: number }[]) {
  const ids = (t: string) => [...new Set(notas.filter((n) => n.tipoAlvo === t).map((n) => n.alvoId))];
  const [vereadores, sessoes, proposicoes] = await Promise.all([
    db.vereador.findMany({ where: { id: { in: ids("vereador") } }, select: { id: true, nomeParlamentar: true } }),
    db.sessao.findMany({ where: { id: { in: ids("sessao") } }, select: { id: true, numero: true, tipo: true, ano: true } }),
    db.proposicao.findMany({
      where: { id: { in: ids("proposicao") } },
      select: { id: true, titulo: true, tipo: true, numero: true, ano: true },
    }),
  ]);
  const mapa = new Map<string, Alvo>();
  for (const v of vereadores) mapa.set(`vereador:${v.id}`, { rotulo: v.nomeParlamentar, href: `/vereadores/${v.id}` });
  for (const s of sessoes) {
    mapa.set(`sessao:${s.id}`, { rotulo: `${s.numero}ª ${tipoCurto(s.tipo)} de ${s.ano}`, href: `/sessoes/${s.id}` });
  }
  for (const p of proposicoes) {
    const rotulo = p.titulo ?? `${p.tipo} Nº ${p.numero}/${p.ano}`;
    mapa.set(`proposicao:${p.id}`, { rotulo, href: `/proposicoes/${p.id}` });
  }
  return (tipo: string, id: number): Alvo =>
    mapa.get(`${tipo}:${id}`) ?? { rotulo: REMOVIDO[tipo as TipoAlvo] ?? "Alvo removido", href: null };
}

/** As notas mais recentes (até `limite`) e o total, para a tela avisar quando corta. */
export async function listNotasComTotal(filtro: { tipoAlvo?: TipoAlvo }, limite = LIMITE_NOTAS) {
  const where = filtro.tipoAlvo ? { tipoAlvo: filtro.tipoAlvo } : {};
  const [notas, total] = await Promise.all([
    db.notaPessoal.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
      take: limite,
      select: SELECT_NOTA,
    }),
    db.notaPessoal.count({ where }),
  ]);
  const alvoDe = await resolverAlvos(notas);
  return { notas: notas.map((n) => ({ ...n, alvo: alvoDe(n.tipoAlvo, n.alvoId) })), total };
}

export async function listNotas(filtro: { tipoAlvo?: TipoAlvo }) {
  return (await listNotasComTotal(filtro)).notas;
}

export type NotaListada = Awaited<ReturnType<typeof listNotas>>[number];
