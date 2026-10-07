import { json, requireApiSession } from "@/lib/api";
import { getSessao } from "@/lib/sessoes";

export async function GET(_request: Request, ctx: RouteContext<"/api/sessoes/[id]">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await ctx.params;
  const sessao = /^\d{1,9}$/.test(id) ? await getSessao(Number(id)) : null;
  if (!sessao) {
    return json({ error: "Sessão não encontrada" }, { status: 404 });
  }
  // DTO explícito: campos internos de coleta não saem pela API.
  const { id: sid, numero, ano, tipo, dataInicio, dataFim, status, titulo, gwlegisId } = sessao;
  return json({ id: sid, numero, ano, tipo, dataInicio, dataFim, status, titulo, gwlegisId });
}
