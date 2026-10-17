import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buscarDivergentes, montarContexto } from "@/lib/ia/contexto-vereador";

async function seed() {
  const mk = (nomeParlamentar: string, partido = "X") =>
    db.vereador.create({ data: { nome: nomeParlamentar, nomeParlamentar, partido, fonteUrl: "x" } });
  const [ana, bia, caio, davi] = [await mk("Ana", "PSD"), await mk("Bia"), await mk("Caio"), await mk("Davi")];
  const sessao = (numero: number, iso: string) =>
    db.sessao.create({
      data: { numero, ano: 2026, tipo: "Sessão Ordinária", dataInicio: new Date(iso), fonteUrl: "x" },
    });
  const s1 = await sessao(1, "2026-02-03T19:00:00Z");
  const s2 = await sessao(2, "2026-02-10T19:00:00Z");
  const votacao = (sessaoId: number, descricao: string) =>
    db.votacao.create({ data: { sessaoId, descricao, resultado: "Aprovado", fonteUrl: "x" } });
  const vMaioria = await votacao(s1.id, "Projeto de Lei Nº 1/2026");
  const vEmpate = await votacao(s1.id, "Requerimento Nº 2/2026");
  const vRecente = await votacao(s2.id, "Moção Nº 3/2026");

  const voto = (votacaoId: number, vereadorId: number, v: string) => ({
    votacaoId,
    vereadorId,
    voto: v,
    fonteUrl: "x",
  });
  await db.voto.createMany({
    data: [
      // Ana contra Bia e Caio: divergente.
      voto(vMaioria.id, ana.id, "nao"),
      voto(vMaioria.id, bia.id, "sim"),
      voto(vMaioria.id, caio.id, "sim"),
      // Empate 1×1 (Caio ausente): não é divergência.
      voto(vEmpate.id, ana.id, "sim"),
      voto(vEmpate.id, bia.id, "nao"),
      voto(vEmpate.id, caio.id, "ausente"),
      // Ana com a maioria.
      voto(vRecente.id, ana.id, "sim"),
      voto(vRecente.id, bia.id, "sim"),
      voto(vRecente.id, caio.id, "nao"),
      // Davi presente mas sem votar (abstenção) diante de maioria favorável: 2 sim × 1,5.
      voto(vRecente.id, davi.id, "nao_votou"),
    ],
  });
  await db.sessaoPresenca.createMany({
    data: [
      { sessaoId: s1.id, vereadorId: ana.id, presente: true, situacao: "PRESENTE", fonteUrl: "x" },
      { sessaoId: s2.id, vereadorId: ana.id, presente: false, situacao: "AUSENTE", fonteUrl: "x" },
    ],
  });
  const prop = await db.proposicao.create({
    data: {
      tipo: "Projeto de Lei",
      numero: 7,
      ano: 2026,
      titulo: "Projeto de Lei Nº 7/2026",
      ementa: "Institui o programa de hortas comunitárias",
      dataProtocolo: new Date("2026-03-01"),
      fonteUrl: "x",
    },
  });
  await db.proposicaoAutor.create({ data: { proposicaoId: prop.id, vereadorId: ana.id } });
  return { ana, caio, davi, vMaioria, vRecente };
}

describe("buscarDivergentes", () => {
  it("só votos sim/não contra maioria clara, com o placar", async () => {
    const { ana, caio, davi, vMaioria, vRecente } = await seed();
    const divAna = await buscarDivergentes(ana.id);
    expect(divAna).toEqual([
      expect.objectContaining({
        votacaoId: vMaioria.id,
        votoVereador: "nao",
        maioria: "sim",
        tipo: "contrario",
        placar: { sim: 2, nao: 1, abstencoes: 0, ausencias: 0 },
      }),
    ]);
    // Caio: ausente no empate não conta; "nao" contra 2 "sim" em vRecente conta.
    expect((await buscarDivergentes(caio.id)).map((d) => d.votacaoId)).toEqual([vRecente.id]);
    expect(await buscarDivergentes(davi.id)).toEqual([
      expect.objectContaining({
        votacaoId: vRecente.id,
        votoVereador: "nao_votou",
        tipo: "abstencao",
        maioria: "sim",
        placar: { sim: 2, nao: 1, abstencoes: 1, ausencias: 0 },
      }),
    ]);
  });
});

describe("montarContexto", () => {
  it("abstenções aparecem separadas das faltas e marcadas como divergência", async () => {
    const { davi } = await seed();
    const ctx = (await montarContexto(davi.id))!;
    expect(ctx).toContain("Abstenção (presente sem votar): 1 (100%)");
    expect(ctx).toContain("Moção Nº 3/2026 → Voto: Não votou [ABSTENÇÃO]");
    const divergentes = ctx.slice(ctx.indexOf("## VOTOS DIVERGENTES"));
    expect(divergentes).toContain("[ABSTENÇÃO diante de maioria favorável]");
    expect(divergentes).toContain("Placar: 2 sim × 1 não, 1 abstenção");
  });

  it("null para vereador inexistente", async () => {
    expect(await montarContexto(999_999)).toBeNull();
  });

  it("reúne perfil, presença, contagem, votos recentes e divergentes", async () => {
    const { ana } = await seed();
    const ctx = (await montarContexto(ana.id))!;
    expect(ctx).toContain("Nome parlamentar: Ana");
    expect(ctx).toContain("Partido: PSD");
    expect(ctx).toContain(
      "[2026-03-01] Projeto de Lei Nº 7/2026 — Institui o programa de hortas comunitárias",
    );
    expect(ctx).toContain("Presente em 1 de 2 sessões (50%)");
    expect(ctx).toContain("Favorável: 2");
    expect(ctx).toContain("Contrário: 1");
    expect(ctx).toContain("[2026-02-10] Moção Nº 3/2026 → Voto: Favorável | Resultado: Aprovado");
    const divergentes = ctx.slice(ctx.indexOf("## VOTOS DIVERGENTES"));
    expect(divergentes).toContain("Projeto de Lei Nº 1/2026");
    expect(divergentes).not.toContain("Requerimento Nº 2/2026");
  });
});
