import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { escaparLike, normalizarConsulta, numeroDaConsulta, termosDaConsulta } from "@/lib/busca-texto";
import { db } from "@/lib/db";

const LIMITE_PROPOSICOES = 20;
const LIMITE_SESSOES = 10;

export type ProposicaoAchada = {
  id: number;
  titulo: string;
  ementa: string | null;
  status: string | null;
  dataProtocolo: Date | null;
};

function likes(coluna: Prisma.Sql, termos: string[]): Prisma.Sql {
  return Prisma.join(
    termos.map((t) => Prisma.sql`${coluna} LIKE ${`%${escaparLike(t)}%`} ESCAPE '\\'`),
    " AND ",
  );
}

async function buscarProposicoes(consulta: string, termos: string[]) {
  const num = numeroDaConsulta(consulta);
  const where = num
    ? num.ano
      ? Prisma.sql`numero = ${num.numero} AND ano = ${num.ano}`
      : Prisma.sql`numero = ${num.numero}`
    : likes(Prisma.sql`busca`, termos); // índice GIN trigram em proposicoes.busca

  const [items, [{ total }]] = await Promise.all([
    db.$queryRaw<ProposicaoAchada[]>`
      SELECT id, titulo, ementa, status, data_protocolo AS "dataProtocolo"
      FROM proposicoes WHERE ${where}
      ORDER BY data_protocolo DESC NULLS LAST, id DESC
      LIMIT ${LIMITE_PROPOSICOES}`,
    db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM proposicoes WHERE ${where}`,
  ]);
  return { items, total: Number(total) };
}

async function buscarSessoes(termos: string[]) {
  // ~1.400 linhas: sem índice; translate() tira os acentos de "Sessão Ordinária".
  // Acentos maiúsculos também: com collation C, lower() não mexe em "Á".
  const titulo = Prisma.sql`lower(translate(titulo, 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'))`;
  return db.$queryRaw<{ id: number; numero: number; ano: number; tipo: string; titulo: string; dataInicio: Date }[]>`
    SELECT id, numero, ano, tipo, titulo, data_inicio AS "dataInicio"
    FROM sessoes WHERE titulo IS NOT NULL AND ${likes(titulo, termos)}
    ORDER BY data_inicio DESC
    LIMIT ${LIMITE_SESSOES}`;
}

async function buscarVereadores(termos: string[]) {
  // Poucas dezenas de linhas: filtra em memória com a mesma normalização.
  const todos = await db.vereador.findMany({
    select: { id: true, nomeParlamentar: true, nome: true, partido: true, fotoUrl: true, status: true },
    orderBy: { nomeParlamentar: "asc" },
  });
  return todos
    .filter((v) => {
      const alvo = normalizarConsulta(`${v.nomeParlamentar} ${v.nome} ${v.partido}`);
      return termos.every((t) => alvo.includes(t));
    })
    .map(({ id, nomeParlamentar, partido, fotoUrl, status }) => ({
      id,
      nomeParlamentar,
      partido,
      fotoUrl,
      status,
    }));
}

export async function buscar(raw: string) {
  const consulta = normalizarConsulta(raw);
  const termos = termosDaConsulta(consulta);
  if (termos.length === 0 && !numeroDaConsulta(consulta)) {
    return { consulta: "", proposicoes: { items: [], total: 0 }, sessoes: [], vereadores: [] };
  }
  const [proposicoes, sessoes, vereadores] = await Promise.all([
    buscarProposicoes(consulta, termos),
    termos.length ? buscarSessoes(termos) : Promise.resolve([]),
    termos.length ? buscarVereadores(termos) : Promise.resolve([]),
  ]);
  return { consulta, proposicoes, sessoes, vereadores };
}

export type ResultadoBusca = Awaited<ReturnType<typeof buscar>>;
