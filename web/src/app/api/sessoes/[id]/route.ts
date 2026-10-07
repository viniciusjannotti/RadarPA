import { getSessao } from "@/lib/sessoes";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessoes/[id]">) {
  const { id } = await ctx.params;
  const sessao = /^\d{1,9}$/.test(id) ? await getSessao(Number(id)) : null;
  if (!sessao) {
    return Response.json({ error: "Sessão não encontrada" }, { status: 404 });
  }
  return Response.json(sessao);
}
