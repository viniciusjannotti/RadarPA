import "server-only";
import { db } from "@/lib/db";

// Ordem de exibição da Mesa Diretora (cargos fora da lista vão para o fim da Mesa).
const ORDEM_MESA = [
  "Presidente",
  "Vice-Presidente",
  "2º Vice-Presidente",
  "1º Secretário(a)",
  "2º Secretário(a)",
];

function rankMesa(cargo: string | null): number {
  if (!cargo) return Number.MAX_SAFE_INTEGER;
  const i = ORDEM_MESA.indexOf(cargo);
  return i === -1 ? ORDEM_MESA.length : i;
}

/** Legislatura em curso = a de início mais recente (null antes da 1ª coleta). */
async function legislaturaAtualId(): Promise<number | null> {
  const leg = await db.legislatura.findFirst({ orderBy: { inicio: "desc" }, select: { id: true } });
  return leg?.id ?? null;
}

// Cargo na Mesa só conta na legislatura atual (o mesmo vereador pode ter presidido outra).
function mesaAtual(legislaturaId: number | null) {
  return {
    where: { legislaturaId: legislaturaId ?? -1 },
    select: { cargo: true },
    orderBy: { id: "asc" as const },
    take: 1,
  };
}

export async function listVereadores() {
  const legId = await legislaturaAtualId();
  const rows = await db.vereador.findMany({
    where: { status: "ativo" },
    select: {
      id: true,
      nomeParlamentar: true,
      partido: true,
      fotoUrl: true,
      mesaDiretora: mesaAtual(legId),
    },
  });
  return rows
    .map(({ mesaDiretora, ...v }) => ({ ...v, cargoMesa: mesaDiretora[0]?.cargo ?? null }))
    .sort(
      (a, b) =>
        rankMesa(a.cargoMesa) - rankMesa(b.cargoMesa) ||
        a.nomeParlamentar.localeCompare(b.nomeParlamentar, "pt-BR"),
    );
}

export type VereadorResumo = Awaited<ReturnType<typeof listVereadores>>[number];

export async function getVereador(id: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const legId = await legislaturaAtualId();
  const v = await db.vereador.findUnique({
    where: { id },
    select: {
      id: true,
      gwlegisId: true,
      nomeParlamentar: true,
      partido: true,
      fotoUrl: true,
      email: true,
      status: true,
      coletadoEm: true,
      legislatura: { select: { inicio: true, fim: true } },
      mesaDiretora: mesaAtual(legId),
      comissoes: {
        select: { cargo: true, comissao: { select: { id: true, sigla: true, nome: true } } },
        orderBy: { comissao: { sigla: "asc" } },
      },
    },
  });
  if (!v) return null;
  const { mesaDiretora, comissoes, ...rest } = v;
  return {
    ...rest,
    cargoMesa: mesaDiretora[0]?.cargo ?? null,
    comissoes: comissoes.map((m) => ({ ...m.comissao, cargo: m.cargo })),
  };
}
