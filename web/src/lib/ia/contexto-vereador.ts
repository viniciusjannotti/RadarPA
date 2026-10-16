import "server-only";
import { db } from "@/lib/db";
import { ehAbstencao, ehDivergente, maioriaDe } from "@/lib/ia/divergencia";
import { getProducaoVereador } from "@/lib/proposicoes";
import { getVereador } from "@/lib/vereadores";
import { getResumoVereador, VOTO_LABEL } from "@/lib/votacoes";

const LIMITE_VOTOS_RECENTES = 50;
const LIMITE_DIVERGENTES = 30;

export type PlacarDetalhado = { sim: number; nao: number; abstencoes: number; ausencias: number };

export interface VotoDivergente {
  votacaoId: number;
  sessaoId: number;
  data: Date;
  descricao: string;
  resultado: string | null;
  votoVereador: string;
  /** "abstencao": presente sem votar diante de maioria favorável. */
  tipo: "contrario" | "abstencao";
  maioria: "sim" | "nao";
  placar: PlacarDetalhado;
}

function placarDetalhado(votos: { voto: string; n?: number }[]): PlacarDetalhado {
  const p: PlacarDetalhado = { sim: 0, nao: 0, abstencoes: 0, ausencias: 0 };
  for (const { voto, n = 1 } of votos) {
    if (voto === "sim") p.sim += n;
    else if (voto === "nao") p.nao += n;
    else if (ehAbstencao(voto)) p.abstencoes += n;
    else p.ausencias += n;
  }
  return p;
}

/**
 * Votações em que o vereador ficou contra a maioria clara (regra em divergencia.ts:
 * abstenção pesa meio voto contrário e, diante de maioria favorável, conta como divergência).
 */
export async function buscarDivergentes(vereadorId: number): Promise<VotoDivergente[]> {
  const votos = await db.voto.findMany({
    where: { vereadorId, voto: { in: ["sim", "nao", "nao_votou", "ausente_plenario"] } },
    orderBy: [
      { votacao: { sessao: { dataInicio: "desc" } } },
      { votacao: { ordem: { sort: "desc", nulls: "last" } } },
    ],
    select: {
      voto: true,
      votacao: {
        select: {
          id: true,
          descricao: true,
          resultado: true,
          sessao: { select: { id: true, dataInicio: true } },
          votos: { select: { voto: true } },
        },
      },
    },
  });

  return votos
    .filter((v) => ehDivergente(v.voto, v.votacao.votos))
    .map((v): VotoDivergente => ({
      votacaoId: v.votacao.id,
      sessaoId: v.votacao.sessao.id,
      data: v.votacao.sessao.dataInicio,
      descricao: v.votacao.descricao,
      resultado: v.votacao.resultado,
      votoVereador: v.voto,
      tipo: ehAbstencao(v.voto) ? "abstencao" : "contrario",
      // ehDivergente só aceita votações com maioria clara.
      maioria: maioriaDe(v.votacao.votos)!,
      placar: placarDetalhado(v.votacao.votos),
    }));
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const rotulo = (voto: string) => (VOTO_LABEL[voto] ?? voto) + (ehAbstencao(voto) ? " [ABSTENÇÃO]" : "");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function textoPlacar(p: PlacarDetalhado): string {
  let t = `${p.sim} sim × ${p.nao} não`;
  if (p.abstencoes > 0) t += `, ${plural(p.abstencoes, "abstenção", "abstenções")}`;
  return t;
}

/** Texto estruturado com os dados públicos do vereador, usado como contexto da IA. */
export async function montarContexto(vereadorId: number): Promise<string | null> {
  const v = await getVereador(vereadorId);
  if (!v) return null;

  const [resumo, producao, divergentes, porVoto] = await Promise.all([
    getResumoVereador(v.id, LIMITE_VOTOS_RECENTES),
    getProducaoVereador(v.id, 0),
    buscarDivergentes(v.id),
    db.voto.groupBy({ by: ["voto"], where: { vereadorId: v.id }, _count: { _all: true } }),
  ]);

  const l: string[] = [];
  l.push("## DADOS DO VEREADOR");
  l.push(`Nome parlamentar: ${v.nomeParlamentar}`);
  l.push(`Partido: ${v.partido}`);
  l.push(`Situação: ${v.status === "ativo" ? "Em exercício" : v.status}`);
  if (v.cargoMesa) l.push(`Cargo na Mesa Diretora: ${v.cargoMesa}`);
  if (v.legislatura) l.push(`Mandato: ${dia(v.legislatura.inicio)} a ${dia(v.legislatura.fim)}`);

  if (v.comissoes.length > 0) {
    l.push("\n## COMISSÕES");
    for (const c of v.comissoes) l.push(`- ${c.sigla} – ${c.nome} (${c.cargo})`);
  }

  if (resumo.presenca) {
    const p = resumo.presenca;
    l.push("\n## PRESENÇA EM SESSÕES (boletins desde 2026)");
    l.push(`Presente em ${p.presentes} de ${p.total} sessões (${p.percentual}%)`);
  }

  const p = placarDetalhado(porVoto.map((g) => ({ voto: g.voto, n: g._count._all })));
  const totalVotos = p.sim + p.nao + p.abstencoes + p.ausencias;
  if (totalVotos > 0) {
    const pct = (n: number) => Math.round((n / totalVotos) * 100);
    l.push("\n## VOTOS NOMINAIS (desde 2026)");
    l.push(`Total: ${totalVotos}`);
    l.push(`Favorável: ${p.sim} (${pct(p.sim)}%)`);
    l.push(`Contrário: ${p.nao} (${pct(p.nao)}%)`);
    l.push(`Abstenção (presente sem votar): ${p.abstencoes} (${pct(p.abstencoes)}%)`);
    l.push(`Falta (ausente da sessão/votação): ${p.ausencias} (${pct(p.ausencias)}%)`);
  }

  if (producao.total > 0) {
    l.push("\n## PRODUÇÃO LEGISLATIVA (proposições de autoria)");
    l.push(`Total: ${producao.total}`);
    for (const t of producao.porTipo) l.push(`- ${t.tipo}: ${t.total}`);
  }

  if (resumo.votosRecentes.length > 0) {
    l.push(`\n## VOTAÇÕES RECENTES (até ${LIMITE_VOTOS_RECENTES})`);
    for (const r of resumo.votosRecentes) {
      l.push(`- [${dia(r.data)}] ${r.descricao} → Voto: ${rotulo(r.voto)} | Resultado: ${r.resultado ?? "?"}`);
    }
  }

  if (divergentes.length > 0) {
    l.push(`\n## VOTOS DIVERGENTES (votou contra a maioria; total ${divergentes.length})`);
    for (const d of divergentes.slice(0, LIMITE_DIVERGENTES)) {
      const marca = d.tipo === "abstencao" ? " [ABSTENÇÃO diante de maioria favorável]" : "";
      l.push(
        `- [${dia(d.data)}] ${d.descricao} → Voto: ${VOTO_LABEL[d.votoVereador] ?? d.votoVereador}${marca} | ` +
          `Placar: ${textoPlacar(d.placar)} | Resultado: ${d.resultado ?? "?"}`,
      );
    }
  } else if (totalVotos > 0) {
    l.push("\n## VOTOS DIVERGENTES\nNenhum voto contra a maioria registrado.");
  }

  return l.join("\n");
}
