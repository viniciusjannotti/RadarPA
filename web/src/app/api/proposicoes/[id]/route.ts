import { json, requireApiSession } from "@/lib/api";
import { getProposicao } from "@/lib/proposicoes";

export async function GET(_request: Request, ctx: RouteContext<"/api/proposicoes/[id]">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await ctx.params;
  const p = /^\d{1,9}$/.test(id) ? await getProposicao(Number(id)) : null;
  if (!p) return json({ error: "Proposição não encontrada" }, { status: 404 });
  return json(p);
}
