import "server-only";
import { db } from "@/lib/db";

export const PAGE_SIZE = 20;

export type SessoesFiltro = {
  page?: number;
  tipo?: string;
  ano?: number;
};

function normalizePage(page: number | undefined): number {
  return Number.isInteger(page) && (page as number) > 0 ? (page as number) : 1;
}

export async function listSessoes(filtro: SessoesFiltro) {
  const where = {
    ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    ...(Number.isInteger(filtro.ano) ? { ano: filtro.ano } : {}),
  };

  const total = await db.sessao.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(normalizePage(filtro.page), totalPages);

  const items = await db.sessao.findMany({
    where,
    orderBy: { dataInicio: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      numero: true,
      ano: true,
      tipo: true,
      dataInicio: true,
      dataFim: true,
      status: true,
      titulo: true,
    },
  });

  return { items, total, page, totalPages };
}

export type SessaoResumo = Awaited<ReturnType<typeof listSessoes>>["items"][number];

export async function getSessao(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.sessao.findUnique({ where: { id } });
}

export async function listTiposSessao(): Promise<string[]> {
  const rows = await db.sessao.findMany({
    distinct: ["tipo"],
    select: { tipo: true },
    orderBy: { tipo: "asc" },
  });
  return rows.map((r) => r.tipo);
}
