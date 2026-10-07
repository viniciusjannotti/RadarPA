import { json, requireApiSession } from "@/lib/api";
import { getSessao } from "@/lib/sessoes";
import { getPresencasDaSessao, getVotacoesDaSessao } from "@/lib/votacoes";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessoes/[id]/votacoes">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await ctx.params;
  const sessao = /^\d{1,9}$/.test(id) ? await getSessao(Number(id)) : null;
  if (!sessao) return json({ error: "Sessão não encontrada" }, { status: 404 });

  const [presenca, votacoes] = await Promise.all([
    getPresencasDaSessao(sessao.id),
    getVotacoesDaSessao(sessao.id),
  ]);
  return json({ sessaoId: sessao.id, presenca, votacoes });
}
